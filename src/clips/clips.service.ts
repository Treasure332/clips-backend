import { Injectable, Logger, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Clip, PostStatus } from './clip.entity';
import type { Video } from '../videos/video.entity';
import type { ClipGenerationJob } from './clip-generation.processor';
import { BulkUpdateClipsDto } from './dto/bulk-update-clips.dto';
import {
  ALL_CLIPS_PROCESSED_EVENT,
  AllClipsProcessedPayload,
  CLIP_GENERATION_FAILED_EVENT,
} from './clips.events';
import type { ClipGenerationFailedPayload } from './clips.events';
import { CLIP_GENERATION_QUEUE, CLIP_JOB_OPTIONS } from './clip-generation.queue';

export type ClipSortField = 'viralityScore' | 'createdAt' | 'duration';
export type SortOrder = 'asc' | 'desc';

export interface ListClipsOptions {
  videoId?: string;
  sortBy?: ClipSortField;
  order?: SortOrder;
  statusFilter?: Clip['status'];
}

export interface BulkUpdateResult {
  updatedCount: number;
  updates: { selected?: boolean; postStatus?: unknown };
  notFoundIds: string[];
  allClipsProcessed: boolean;
}

export interface BulkUpdateResult {
  updatedCount: number;
  /** Summary of the applied changes */
  updates: { selected?: boolean; postStatus?: unknown };
  /** IDs that were not found or did not belong to the user */
  notFoundIds: string[];
  /** True when every clip for the affected video(s) now has postStatus = 'posted' */
  allClipsProcessed: boolean;
}

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);
  /** In-memory stores — replace with Prisma repositories when DB is wired up */
  private readonly clips: Clip[] = [];
  private readonly videos: Map<string, Video> = new Map();
  private readonly videoJobs: Map<string, Set<string>> = new Map();
  private readonly jobControllers: Map<string, AbortController> = new Map();
  private readonly cancelledVideos: Set<string> = new Set();

  constructor(
    @InjectQueue(CLIP_GENERATION_QUEUE)
    private readonly clipQueue: Queue<ClipGenerationJob>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Enqueue a clip-generation job with retry + exponential backoff.
   *
   * BullMQ will attempt the job up to 3 times (CLIP_JOB_OPTIONS.attempts)
   * before moving it to the failed set.
   *
   * When Prisma is wired up, also persist a Clip row here with
   * postStatus='pending' so the UI can show progress immediately.
   */
  async enqueueClip(job: ClipGenerationJob): Promise<{ jobId: string | undefined }> {
    const bullJob = await this.clipQueue.add('generate', job, CLIP_JOB_OPTIONS);
    if (bullJob?.id && job.videoId) {
      const set = this.videoJobs.get(job.videoId) ?? new Set<string>();
      set.add(String(bullJob.id));
      this.videoJobs.set(job.videoId, set);
    }
    return { jobId: bullJob.id };
  }

  /**
   * Listener for the terminal clip-generation failure event.
   *
   * Sets Video.status = 'failed' and stores the error reason so the
   * client can surface it. A future email/push notification hook should
   * also subscribe to CLIP_GENERATION_FAILED_EVENT.
   */
  @OnEvent(CLIP_GENERATION_FAILED_EVENT)
  handleClipGenerationFailed(payload: ClipGenerationFailedPayload): void {
    const video = this.videos.get(payload.videoId);
    if (video) {
      if (video.status !== 'cancelled') {
        video.status = 'failed';
        video.processingError = payload.failedReason;
        video.updatedAt = new Date();
      }
    }
    // TODO: trigger user notification (email / push) using payload.videoId + payload.failedReason
  }

  /**
   * Bulk update clip status in a single (simulated) transaction.
   *
   * When Prisma is wired up, replace the in-memory mutation block with:
   *
   *   await prisma.$transaction(
   *     validIds.map(id =>
   *       prisma.clip.update({ where: { id }, data: patch })
   *     )
   *   );
   */
  async bulkUpdate(userId: string, dto: BulkUpdateClipsDto): Promise<BulkUpdateResult> {
    if (dto.selected === undefined && dto.postStatus === undefined) {
      throw new BadRequestException(
        'At least one of selected or postStatus must be provided',
      );
    }

    // ── Ownership validation ──────────────────────────────────────────────────
    const notFoundIds: string[] = [];
    const validClips: Clip[] = [];

    for (const id of dto.clipIds) {
      const clip = this.clips.find((c) => c.id === id);
      if (!clip || clip.userId !== userId) {
        notFoundIds.push(id);
        continue;
      }
      validClips.push(clip);
    }

    if (validClips.length === 0) {
      throw new ForbiddenException(
        'None of the provided clipIds belong to this user or exist',
      );
    }

    // ── Simulated transaction ─────────────────────────────────────────────────
    const patch: Partial<Pick<Clip, 'selected' | 'postStatus' | 'caption' | 'updatedAt'>> = {
      updatedAt: new Date(),
    };
    if (dto.selected !== undefined) patch.selected = dto.selected;
    if (dto.postStatus !== undefined) patch.postStatus = dto.postStatus as PostStatus;
    if (dto.caption !== undefined) patch.caption = dto.caption;

    for (const clip of validClips) {
      Object.assign(clip, patch);
    }

    // ── Video completion check ────────────────────────────────────────────────
    const affectedVideoIds = [...new Set(validClips.map((c) => c.videoId))];
    let allClipsProcessed = false;

    for (const videoId of affectedVideoIds) {
      const videoClips = this.clips.filter((c) => c.videoId === videoId);
      if (videoClips.every((c) => c.postStatus === 'posted')) {
        allClipsProcessed = true;
        const payload: AllClipsProcessedPayload = { videoId, clipCount: videoClips.length };
        this.eventEmitter.emit(ALL_CLIPS_PROCESSED_EVENT, payload);
      }
    }

    return {
      updatedCount: validClips.length,
      updates: {
        ...(dto.selected !== undefined && { selected: dto.selected }),
        ...(dto.postStatus !== undefined && { postStatus: dto.postStatus }),
      },
      notFoundIds,
      allClipsProcessed,
    };
  }

  /**
   * Bulk update clip status in a single (simulated) transaction.
   *
   * When Prisma is wired up, replace the in-memory mutation block with:
   *
   * sortBy options:
   *   viralityScore (default) — highest viral potential first
   *   createdAt               — newest first by default
   *   duration                — longest first by default
   *
   * statusFilter options:
   *   pending, processing, success, failed
   */
  async bulkUpdate(
    userId: string,
    dto: BulkUpdateClipsDto,
  ): Promise<BulkUpdateResult> {
    if (dto.selected === undefined && dto.postStatus === undefined) {
      throw new BadRequestException('At least one of selected or postStatus must be provided');
    }

    // ── Ownership validation ──────────────────────────────────────────────────
    const notFoundIds: string[] = [];
    const validClips: Clip[] = [];

    for (const id of dto.clipIds) {
      const clip = this.clips.find((c) => c.id === id);
      if (!clip) {
        notFoundIds.push(id);
        continue;
      }
      if (clip.userId !== userId) {
        // Treat as not-found to avoid leaking existence of other users' clips
        notFoundIds.push(id);
        continue;
      }
      validClips.push(clip);
    }

    if (validClips.length === 0) {
      throw new ForbiddenException(
        'None of the provided clipIds belong to this user or exist',
      );
    }

    // ── Simulated transaction — atomic in-memory mutation ────────────────────
    const patch: Partial<Pick<Clip, 'selected' | 'postStatus' | 'caption' | 'updatedAt'>> = {
      updatedAt: new Date(),
    };
    if (dto.selected !== undefined) patch.selected = dto.selected;
    if (dto.postStatus !== undefined) patch.postStatus = dto.postStatus as PostStatus;
    if (dto.caption !== undefined) patch.caption = dto.caption;

    for (const clip of validClips) {
      Object.assign(clip, patch);
    }

    // ── Video completion check ────────────────────────────────────────────────
    // Collect distinct videoIds touched by this update
    const affectedVideoIds = [...new Set(validClips.map((c) => c.videoId))];
    let allClipsProcessed = false;

    for (const videoId of affectedVideoIds) {
      const videoClips = this.clips.filter((c) => c.videoId === videoId);
      const allPosted = videoClips.every((c) => c.postStatus === 'posted');

      if (allPosted) {
        allClipsProcessed = true;
        const payload: AllClipsProcessedPayload = {
          videoId,
          clipCount: videoClips.length,
        };
        this.eventEmitter.emit(ALL_CLIPS_PROCESSED_EVENT, payload);
      }
    }

    return {
      updatedCount: validClips.length,
      updates: {
        ...(dto.selected !== undefined && { selected: dto.selected }),
        ...(dto.postStatus !== undefined && { postStatus: dto.postStatus }),
      },
      notFoundIds,
      allClipsProcessed,
    };
  }

  listClips(options: ListClipsOptions = {}): Clip[] {
    const {
      videoId,
      sortBy = 'viralityScore',
      order = 'desc',
      statusFilter,
    } = options;

    let result = videoId
      ? this.clips.filter((c) => c.videoId === videoId)
      : [...this.clips];

    // Filter by status if provided
    if (statusFilter) {
      result = result.filter((c) => c.status === statusFilter);
    }

    return result.sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortBy) {
        case 'viralityScore':
          aVal = a.viralityScore ?? -1;
          bVal = b.viralityScore ?? -1;
          break;
        case 'createdAt':
          aVal = a.createdAt.getTime();
          bVal = b.createdAt.getTime();
          break;
        case 'duration':
          aVal = a.endTime - a.startTime;
          bVal = b.endTime - b.startTime;
          break;
        default:
          return 0;
      }

      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  /**
   * Find clip by ID
   */
  findById(id: string): Clip | undefined {
    return this.clips.find((c) => c.id === id);
  }

  /**
   * Get clips by status (e.g., 'failed' to find clips needing retry)
   */
  getClipsByStatus(status: Clip['status']): Clip[] {
    return this.clips.filter((c) => c.status === status);
  }

  /**
   * Retry upload for a clip that failed Cloudinary upload
   * Useful for manual intervention or scheduled retry jobs
   */
  async retryFailedUpload(clipId: string): Promise<{ success: boolean; error?: string }> {
    const clip = this.findById(clipId);
    
    if (!clip) {
      return { success: false, error: 'Clip not found' };
    }

    if (clip.status !== 'upload_failed') {
      return { success: false, error: `Clip status is ${clip.status}, not upload_failed` };
    }

    if (!clip.localFilePath) {
      return { success: false, error: 'No local file path available for retry' };
    }

    this.logger.log(`Retrying upload for clip ${clipId} from ${clip.localFilePath}`);
    
    // Re-enqueue the clip generation job to retry upload
    // This will use the existing local file
    const job: ClipGenerationJob = {
      videoId: clip.videoId,
      inputPath: '', // Not needed for retry
      outputPath: clip.localFilePath,
      startTime: clip.startTime,
      endTime: clip.endTime,
      positionRatio: clip.positionRatio,
      transcript: clip.transcript,
    };

    try {
      await this.enqueueClip(job);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as any).message };
    }
  }

  /**
   * Mark clip as failed for manual intervention/retry
   */
  markClipFailed(id: string, error: string): void {
    const clip = this.findById(id);
    if (clip) {
      clip.status = 'failed';
      clip.error = error;
      this.logger.log(`Clip marked as failed: ${id} → ${error}`);
    }
  }

  /**
   * Update clip with Cloudinary URL and thumbnail
   */
  updateClipUrls(
    id: string,
    clipUrl: string,
    thumbnail?: string,
  ): void {
    const clip = this.findById(id);
    if (clip) {
      clip.clipUrl = clipUrl;
      clip.thumbnail = thumbnail;
      clip.status = 'success';
      this.logger.log(`Clip URLs updated: ${id}`);
    }
  }

  /** Exposed for testing */
  _seed(clips: Clip[]): void {
    this.clips.push(...clips);
  }

  _seedVideo(video: Video): void {
    this.videos.set(video.id, video);
  }

  _getVideo(id: string): Video | undefined {
    return this.videos.get(id);
  }

  _registerJobController(videoId: string, jobId: string, controller: AbortController): void {
    if (jobId) {
      this.jobControllers.set(jobId, controller);
    }
    if (videoId) {
      const set = this.videoJobs.get(videoId) ?? new Set<string>();
      set.add(jobId);
      this.videoJobs.set(videoId, set);
    }
  }

  _clearJobController(jobId: string): void {
    this.jobControllers.delete(jobId);
  }

  _isVideoCancelled(videoId: string): boolean {
    return this.cancelledVideos.has(videoId);
  }

  async cancelVideo(videoId: string): Promise<{ cancelled: boolean; removedJobs: number; abortedJobs: number }> {
    const video = this.videos.get(videoId);
    if (video) {
      video.status = 'cancelled';
      video.processingError = null;
      video.updatedAt = new Date();
    }
    this.cancelledVideos.add(videoId);
    const jobIds = [...(this.videoJobs.get(videoId) ?? new Set<string>())];
    let removedJobs = 0;
    let abortedJobs = 0;
    for (const id of jobIds) {
      const controller = this.jobControllers.get(id);
      if (controller) {
        try {
          controller.abort();
          abortedJobs++;
        } catch {}
      }
      try {
        const job = await this.clipQueue.getJob(id);
        if (job) {
          await job.remove();
          removedJobs++;
        }
      } catch {}
    }
    return { cancelled: true, removedJobs, abortedJobs };
  }
}
