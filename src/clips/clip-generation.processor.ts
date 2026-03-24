import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Clip } from './clip.entity';
import { calculateViralityScore } from './virality-score.util';
import { cutClip } from './ffmpeg.util';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';
import {
  CLIP_GENERATION_FAILED_EVENT,
  ClipGenerationFailedPayload,
} from './clips.events';

export interface ClipGenerationJob {
  videoId: string;
  /** Absolute path to the source video file */
  inputPath: string;
  /** Absolute path for the output clip file */
  outputPath: string;
  /** Start time in seconds — float safe (e.g. 12.5) */
  startTime: number;
  /** End time in seconds — float safe (e.g. 45.7) */
  endTime: number;
  /** Total duration of the source video in seconds (used to clamp endTime) */
  videoDuration?: number;
  /** 0.0–1.0: where in the source video this clip starts */
  positionRatio: number;
  transcript?: string;
}

/**
 * BullMQ processor for clip-generation jobs.
 *
 * Retry configuration (set per-job in ClipsService.enqueueClip via CLIP_JOB_OPTIONS):
 *   attempts : 3   — 1 initial attempt + 2 automatic retries
 *   backoff  : exponential, starting at 1 000 ms
 *              attempt 2 → ~1 000 ms wait
 *              attempt 3 → ~2 000 ms wait
 *
 * After all 3 attempts fail, BullMQ moves the job to the failed set and
 * fires the 'failed' worker event, handled by @OnWorkerEvent('failed') below.
 */
@Processor(CLIP_GENERATION_QUEUE)
export class ClipGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ClipGenerationProcessor.name);

  constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  /** Main job handler — called by BullMQ on each attempt */
  async process(job: Job<ClipGenerationJob>): Promise<Clip> {
    const data = job.data;
    const durationSeconds = data.endTime - data.startTime;

    this.logger.log(
      `Processing clip job ${job.id} — attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1} ` +
        `videoId=${data.videoId}`,
    );

    // FFmpeg cut — may throw transiently (OOM, network mount, etc.)
    await cutClip({
      inputPath: data.inputPath,
      outputPath: data.outputPath,
      startTime: data.startTime,
      endTime: data.endTime,
      videoDuration: data.videoDuration,
    });

    const viralityScore = calculateViralityScore({
      durationSeconds,
      positionRatio: data.positionRatio,
      transcript: data.transcript,
    });

    this.logger.log(
      `Clip scored — videoId=${data.videoId} ` +
        `duration=${durationSeconds}s ` +
        `position=${(data.positionRatio * 100).toFixed(0)}% ` +
        `viralityScore=${viralityScore}`,
    );

    return {
      id: `${data.videoId}-${data.startTime}-${data.endTime}`,
      videoId: data.videoId,
      userId: '',          // populated by ClipsService after dequeue
      startTime: data.startTime,
      endTime: data.endTime,
      positionRatio: data.positionRatio,
      transcript: data.transcript,
      viralityScore,
      selected: false,
      postStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Called by BullMQ after a job has exhausted ALL retry attempts.
   *
   * Responsibilities:
   *  1. Log the terminal failure with job.failedReason
   *  2. Emit CLIP_GENERATION_FAILED_EVENT so listeners can:
   *     - Set Video.status = 'failed' and Video.processingError = failedReason
   *     - Trigger a user notification (email / push — future work)
   *
   * NOTE: this handler fires only on the FINAL failure, not on intermediate
   * retries. Intermediate failures are handled silently by BullMQ's backoff.
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<ClipGenerationJob>, error: Error): void {
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);

    this.logger.error(
      `Clip job ${job.id} failed — ` +
        `attempt ${job.attemptsMade}/${job.opts.attempts ?? 1} — ` +
        `reason: ${error.message}`,
    );

    if (!isFinalAttempt) {
      // Intermediate failure — BullMQ will retry with backoff; nothing else to do
      return;
    }

    // Final failure — notify the rest of the system
    const payload: ClipGenerationFailedPayload = {
      jobId: job.id,
      videoId: job.data.videoId,
      failedReason: job.failedReason ?? error.message,
      attemptsMade: job.attemptsMade,
    };

    this.eventEmitter.emit(CLIP_GENERATION_FAILED_EVENT, payload);
  }
}
