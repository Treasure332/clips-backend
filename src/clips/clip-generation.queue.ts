/** BullMQ queue name for clip-generation jobs */
export const CLIP_GENERATION_QUEUE = 'clip-generation';

/**
 * Default job options applied to every clip-generation job.
 *
 * Retry strategy:
 *   - Up to 3 attempts total (1 initial + 2 retries)
 *   - Exponential backoff starting at 1 000 ms
 *     attempt 1 → immediate
 *     attempt 2 → ~1 000 ms delay
 *     attempt 3 → ~2 000 ms delay
 *   - After all attempts are exhausted BullMQ moves the job to the
 *     failed set, which triggers the @OnWorkerEvent('failed') handler.
 */
export const CLIP_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
} as const;
