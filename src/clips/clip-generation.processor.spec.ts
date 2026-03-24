import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { ClipGenerationProcessor, ClipGenerationJob } from './clip-generation.processor';
import { CLIP_GENERATION_FAILED_EVENT } from './clips.events';
import { CLIP_JOB_OPTIONS } from './clip-generation.queue';

// ── Mock heavy dependencies ───────────────────────────────────────────────────

jest.mock('./ffmpeg.util', () => ({
  cutClip: jest.fn().mockResolvedValue('out.mp4'),
}));

jest.mock('./virality-score.util', () => ({
  calculateViralityScore: jest.fn().mockReturnValue(75),
}));

import { cutClip } from './ffmpeg.util';

// ── Helpers ───────────────────────────────────────────────────────────────────

const JOB_DATA: ClipGenerationJob = {
  videoId: 'video-1',
  inputPath: '/tmp/in.mp4',
  outputPath: '/tmp/out.mp4',
  startTime: 12.5,
  endTime: 45.7,
  positionRatio: 0.5,
};

function makeJob(overrides: Partial<Job<ClipGenerationJob>> = {}): Job<ClipGenerationJob> {
  return {
    id: 'job-1',
    data: JOB_DATA,
    attemptsMade: 0,
    failedReason: undefined,
    opts: { attempts: CLIP_JOB_OPTIONS.attempts },
    ...overrides,
  } as unknown as Job<ClipGenerationJob>;
}

function makeProcessor() {
  const emitter = new EventEmitter2();
  jest.spyOn(emitter, 'emit');
  const processor = new ClipGenerationProcessor(emitter);
  return { processor, emitter };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClipGenerationProcessor', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('process()', () => {
    it('calls cutClip with correct float-safe args', async () => {
      const { processor } = makeProcessor();
      await processor.process(makeJob());

      expect(cutClip).toHaveBeenCalledWith(
        expect.objectContaining({
          inputPath: '/tmp/in.mp4',
          outputPath: '/tmp/out.mp4',
          startTime: 12.5,
          endTime: 45.7,
        }),
      );
    });

    it('returns a Clip with viralityScore populated', async () => {
      const { processor } = makeProcessor();
      const clip = await processor.process(makeJob());

      expect(clip.viralityScore).toBe(75);
      expect(clip.videoId).toBe('video-1');
      expect(clip.selected).toBe(false);
      expect(clip.postStatus).toBeNull();
    });

    it('propagates errors so BullMQ can retry', async () => {
      (cutClip as jest.Mock).mockRejectedValueOnce(new Error('OOM'));
      const { processor } = makeProcessor();

      await expect(processor.process(makeJob())).rejects.toThrow('OOM');
    });
  });

  describe('onFailed() — @OnWorkerEvent("failed")', () => {
    it('emits CLIP_GENERATION_FAILED_EVENT on the final attempt', () => {
      const { processor, emitter } = makeProcessor();
      const job = makeJob({
        attemptsMade: CLIP_JOB_OPTIONS.attempts, // equals max → final failure
        failedReason: 'FFmpeg OOM after 3 attempts',
      });

      processor.onFailed(job, new Error('FFmpeg OOM after 3 attempts'));

      expect(emitter.emit).toHaveBeenCalledWith(
        CLIP_GENERATION_FAILED_EVENT,
        expect.objectContaining({
          jobId: 'job-1',
          videoId: 'video-1',
          failedReason: 'FFmpeg OOM after 3 attempts',
          attemptsMade: CLIP_JOB_OPTIONS.attempts,
        }),
      );
    });

    it('does NOT emit event on intermediate failures (BullMQ will retry)', () => {
      const { processor, emitter } = makeProcessor();
      // attemptsMade=1 < attempts=3 → still has retries left
      const job = makeJob({ attemptsMade: 1 });

      processor.onFailed(job, new Error('transient network error'));

      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('uses job.failedReason over error.message when available', () => {
      const { processor, emitter } = makeProcessor();
      const job = makeJob({
        attemptsMade: CLIP_JOB_OPTIONS.attempts,
        failedReason: 'rate limit exceeded',
      });

      processor.onFailed(job, new Error('different message'));

      expect(emitter.emit).toHaveBeenCalledWith(
        CLIP_GENERATION_FAILED_EVENT,
        expect.objectContaining({ failedReason: 'rate limit exceeded' }),
      );
    });
  });

  describe('CLIP_JOB_OPTIONS', () => {
    it('configures 3 attempts with exponential backoff at 1000ms', () => {
      expect(CLIP_JOB_OPTIONS.attempts).toBe(3);
      expect(CLIP_JOB_OPTIONS.backoff.type).toBe('exponential');
      expect(CLIP_JOB_OPTIONS.backoff.delay).toBe(1000);
    });
  });
});
