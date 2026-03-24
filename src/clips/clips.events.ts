/** Emitted after a bulk update when every clip in a video has postStatus = 'posted' */
export const ALL_CLIPS_PROCESSED_EVENT = 'clips.allProcessed';

export interface AllClipsProcessedPayload {
  videoId: string;
  clipCount: number;
}

/**
 * Emitted when a clip-generation job exhausts all retry attempts.
 * Consumers should mark Video.status = 'failed' and notify the user.
 */
export const CLIP_GENERATION_FAILED_EVENT = 'clips.generationFailed';

export interface ClipGenerationFailedPayload {
  jobId: string | undefined;
  videoId: string;
  /** The reason string from job.failedReason (BullMQ) */
  failedReason: string;
  attemptsMade: number;
}
