import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Clip } from './clip.entity';
import { calculateViralityScore } from './virality-score.util';
import { cutClip } from './ffmpeg.util';
import { generateCaption } from './caption.util';
import { CloudinaryService } from './cloudinary.service';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';
import {
  CLIP_GENERATION_FAILED_EVENT,
  ClipGenerationFailedPayload,
} from './clips.events';
import { ClipsGateway } from './clips.gateway';
import { ClipsService } from './clips.service';

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
  /** Video title — used to auto-generate the caption placeholder */
  title?: string;
}

export interface ClipProcessingResult {
  clip: Clip;
  retryCount?: number;
  error?: string;
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
 * After FFmpeg cuts a clip, uploads to Cloudinary for reliable CDN delivery:
 *   1. Uploads video buffer using upload_stream
 *   2. Generates auto-thumbnail at 50% video position
 *   3. Deletes local temporary file after success
 *   4. Handles errors with BullMQ retries (exponential backoff)
 *
 * After all 3 attempts fail, BullMQ moves the job to the failed set and
 * fires the 'failed' worker event, handled by @OnWorkerEvent('failed') below.
 */
@Processor(CLIP_GENERATION_QUEUE)
export class ClipGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ClipGenerationProcessor.name);

  constructor(
    private readonly cloudinaryService: CloudinaryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly clipsGateway: ClipsGateway,
    private readonly clipsService: ClipsService,
  ) {
    super();
  }

  /** Main job handler — called by BullMQ on each attempt */
  async process(job: Job<ClipGenerationJob>): Promise<Clip> {
    const data = job.data;
    const durationSeconds = data.endTime - data.startTime;
    const clipId = `${data.videoId}-${data.startTime}-${data.endTime}`;
    const JOB_TIMEOUT_MS = 30 * 60 * 1000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);
    this.clipsService._registerJobController(data.videoId, String(job.id ?? ''), controller);

    this.logger.log(
      `Processing clip job ${job.id} — attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1} ` +
        `videoId=${data.videoId}`,
    );

    try {
      // FFmpeg cut — may throw transiently (OOM, network mount, etc.)
      this.logger.log(`Starting clip generation: ${clipId}`);
      await job.updateProgress(10);
      await cutClip({
        inputPath: data.inputPath,
        outputPath: data.outputPath,
        startTime: data.startTime,
        endTime: data.endTime,
        videoDuration: data.videoDuration,
        signal: controller.signal,
      });
      await job.updateProgress(50);

      const viralityScore = calculateViralityScore({
        durationSeconds,
        positionRatio: data.positionRatio,
        transcript: data.transcript,
      });

      this.logger.log(
        `Clip cut successfully — videoId=${data.videoId} ` +
          `duration=${durationSeconds}s ` +
          `position=${(data.positionRatio * 100).toFixed(0)}% ` +
          `viralityScore=${viralityScore}`,
      );

      // Upload to Cloudinary with 2 retries
      await job.updateProgress(80);
      const abortPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      });
      const uploadResult = await Promise.race([
        this.uploadToCloudinary(data.outputPath, clipId),
        abortPromise,
      ]);

      if (uploadResult.error) {
        // Upload failed after all retries - keep local file as fallback
        this.logger.error(
          `Cloudinary upload failed after retries for ${clipId}: ${uploadResult.error}. ` +
            `Keeping local file as fallback: ${data.outputPath}`,
        );

        // Return clip with upload_failed status and local file path
        return {
          id: clipId,
          videoId: data.videoId,
          userId: '', // populated by ClipsService after dequeue
          startTime: data.startTime,
          endTime: data.endTime,
          positionRatio: data.positionRatio,
          transcript: data.transcript,
          viralityScore,
          clipUrl: '', // No Cloudinary URL available
          thumbnail: undefined,
          status: 'upload_failed',
          localFilePath: data.outputPath, // Keep local file as fallback
          error: `Cloudinary upload failed: ${uploadResult.error}`,
          selected: false,
          postStatus: null,
          caption: generateCaption(data.title, clipId, data.transcript),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      // Delete local temporary file after successful upload
      await this.cloudinaryService.deleteLocalFile(data.outputPath);

      this.logger.log(
        `Clip processing complete: ${clipId} → ${uploadResult.secure_url}`,
      );
      await job.updateProgress(100);

      return {
        id: clipId,
        videoId: data.videoId,
        userId: '', // populated by ClipsService after dequeue
        startTime: data.startTime,
        endTime: data.endTime,
        positionRatio: data.positionRatio,
        transcript: data.transcript,
        viralityScore,
        clipUrl: uploadResult.secure_url,
        thumbnail: uploadResult.thumbnail_url,
        status: 'success',
        selected: false,
        postStatus: null,
        caption: generateCaption(data.title, clipId, data.transcript),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Clip generation failed for ${clipId}: ${(error as any).message}`,
        (error as any).stack,
      );

      // Only attempt cleanup if the error occurred before/during FFmpeg cut
      // If upload failed, the file is already preserved in the success path
      const errorMessage = (error as any).message || '';
      const isUploadError = errorMessage.includes('Cloudinary') || errorMessage.includes('upload');
      
      if (!isUploadError) {
        // Attempt cleanup of local file for non-upload errors
        try {
          await this.cloudinaryService.deleteLocalFile(data.outputPath);
        } catch (cleanupError) {
          this.logger.warn(
            `Cleanup failed for ${data.outputPath}: ${(cleanupError as any).message}`,
          );
        }
      }

      if (controller.signal.aborted) {
        const cancelled = this.clipsService._isVideoCancelled(data.videoId);
        clearTimeout(timeout);
        this.clipsService._clearJobController(String(job.id ?? ''));
        if (cancelled) {
          throw new UnrecoverableError('Cancelled by user');
        } else {
          throw new UnrecoverableError('Timeout');
        }
      }
      clearTimeout(timeout);
      this.clipsService._clearJobController(String(job.id ?? ''));
      throw error;
    }
  }

  /**
   * Upload clip to Cloudinary with 2 retries
   * @param filePath - Path to clip file
   * @param clipId - Unique clip identifier
   */
  private async uploadToCloudinary(
    filePath: string,
    clipId: string,
  ): Promise<any> {
    try {
      const buffer = await this.cloudinaryService.readFileToBuffer(filePath);
      // Upload with 2 retries (3 total attempts)
      const result = await this.cloudinaryService.uploadVideoFromBuffer(
        buffer,
        clipId,
        {}, // default options
        2, // 2 retries
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Upload to Cloudinary failed for ${clipId}: ${(error as any).message}`,
      );
      return {
        error: (error as any).message,
        secure_url: '',
        public_id: clipId,
      };
    }
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

  @OnWorkerEvent('progress')
  onProgress(job: Job<ClipGenerationJob>, progress: number): void {
    const video = this.clipsService._getVideo(job.data.videoId);
    const userId = video?.userId;
    if (!userId) return;
    const clipId = `${job.data.videoId}-${job.data.startTime}-${job.data.endTime}`;
    const payload = {
      jobId: job.id,
      videoId: job.data.videoId,
      percent: Math.max(0, Math.min(100, Math.round(Number(progress) || 0))),
      currentClip: {
        id: clipId,
        startTime: job.data.startTime,
        endTime: job.data.endTime,
        positionRatio: job.data.positionRatio,
      },
    };
    this.clipsGateway.emitProgressToUser(userId, payload);
  }
}
