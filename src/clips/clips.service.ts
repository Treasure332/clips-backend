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

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);
  /** In-memory stores — replace with Prisma repositories when DB is wired up */
  private readonly clips: Clip[] = [];
  private readonly videos: Map<string, Video> = new Map();

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
      video.status = 'failed';
      video.processingError = payload.failedReason;
      video.updatedAt = new Date();
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
    const patch: Partial<Pick<Clip, 'selected' | 'postStatus' | 'updatedAt'>> = {
      updatedAt: new Date(),
    };
    if (dto.selected !== undefined) patch.selected = dto.selected;
    if (dto.postStatus !== undefined) patch.postStatus = dto.postStatus as PostStatus;

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
   * List clips with optional filtering and sorting.
   *
   * sortBy options:
   *   viralityScore (default) — highest viral potential first
   *   createdAt               — newest first by default
   *   duration                — longest first by default
   *
   * statusFilter options:
   *   pending, processing, success, failed
   */
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
}
