import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { VideoService } from './video.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';

/**
 * Example Videos Controller
 * 
 * This is an example implementation showing how to use the Video DTOs
 * with proper validation for targetPlatforms.
 * 
 * To use this controller:
 * 1. Rename this file to videos.controller.ts
 * 2. Update VideoService to include create/update methods
 * 3. Add VideosController to your module's controllers array
 */
@Controller('videos')
export class VideosController {
  constructor(private readonly videoService: VideoService) {}

  /**
   * POST /videos
   * Create a new video with validated targetPlatforms
   * 
   * Example request body:
   * {
   *   "userId": 1,
   *   "sourceUrl": "https://youtube.com/watch?v=test",
   *   "title": "My Video",
   *   "targetPlatforms": ["TikTok", "Instagram", "YOUTUBE-SHORTS"]
   * }
   * 
   * The targetPlatforms will be automatically:
   * - Validated (only supported platforms)
   * - Normalized to lowercase
   * - Deduplicated
   * 
   * Result: ["tiktok", "instagram", "youtube-shorts"]
   */
  @Post()
  async create(@Body() createVideoDto: CreateVideoDto) {
    // At this point, createVideoDto.targetPlatforms is:
    // - Validated (only supported platforms)
    // - Normalized (lowercase)
    // - Deduplicated
    
    // Example: Pass to Prisma
    // return this.prisma.video.create({
    //   data: {
    //     ...createVideoDto,
    //     targetPlatforms: createVideoDto.targetPlatforms || [],
    //   },
    // });
    
    return {
      message: 'Video created successfully',
      data: createVideoDto,
    };
  }

  /**
   * GET /videos
   * List all videos
   */
  @Get()
  async findAll() {
    // return this.prisma.video.findMany();
    return { message: 'List all videos' };
  }

  /**
   * GET /videos/:id
   * Get a single video by ID
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    // return this.prisma.video.findUnique({ where: { id } });
    return { message: `Get video ${id}` };
  }

  /**
   * PATCH /videos/:id
   * Update a video with validated targetPlatforms
   * 
   * Example request body:
   * {
   *   "title": "Updated Title",
   *   "targetPlatforms": ["TIKTOK", "tiktok", "Instagram"]
   * }
   * 
   * Result: targetPlatforms = ["tiktok", "instagram"]
   */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVideoDto: UpdateVideoDto,
  ) {
    // At this point, updateVideoDto.targetPlatforms is:
    // - Validated (only supported platforms)
    // - Normalized (lowercase)
    // - Deduplicated
    
    // Example: Pass to Prisma
    // return this.prisma.video.update({
    //   where: { id },
    //   data: updateVideoDto,
    // });
    
    return {
      message: `Video ${id} updated successfully`,
      data: updateVideoDto,
    };
  }

  /**
   * DELETE /videos/:id
   * Delete a video
   */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    // return this.prisma.video.delete({ where: { id } });
    return { message: `Video ${id} deleted` };
  }
}

/**
 * Error Response Examples
 * 
 * 1. Invalid platform:
 * POST /videos
 * {
 *   "userId": 1,
 *   "sourceUrl": "https://youtube.com/watch?v=test",
 *   "targetPlatforms": ["tiktok", "invalid-platform"]
 * }
 * 
 * Response: 400 Bad Request
 * {
 *   "statusCode": 400,
 *   "message": [
 *     "Invalid platform(s): invalid-platform. Supported platforms: tiktok, instagram, youtube-shorts, youtube, facebook, twitter, snapchat"
 *   ],
 *   "error": "Bad Request"
 * }
 * 
 * 2. Not an array:
 * POST /videos
 * {
 *   "userId": 1,
 *   "sourceUrl": "https://youtube.com/watch?v=test",
 *   "targetPlatforms": "tiktok"
 * }
 * 
 * Response: 400 Bad Request
 * {
 *   "statusCode": 400,
 *   "message": [
 *     "targetPlatforms must be an array"
 *   ],
 *   "error": "Bad Request"
 * }
 */
