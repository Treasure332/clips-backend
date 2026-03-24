import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';
import * as fs from 'fs';

export interface CloudinaryUploadResult {
  secure_url: string;
  thumbnail_url?: string;
  public_id: string;
  error?: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor() {
    // Initialize Cloudinary with environment variables
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /**
   * Upload video clip from buffer to Cloudinary
   * @param buffer - Video buffer from FFmpeg
   * @param publicId - Cloudinary public ID for the clip
   * @returns Upload result with secure_url and thumbnail_url
   */
  async uploadVideoFromBuffer(
    buffer: Buffer,
    publicId: string,
    options: {
      folder?: string;
      resourceType?: 'video' | 'image' | 'raw' | 'auto';
      autoTagging?: number;
    } = {},
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve) => {
      const {
        folder = 'clips',
        resourceType = 'video',
        autoTagging = 0.6,
      } = options;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder,
          resource_type: resourceType as any,
          auto_tagging: autoTagging,
          eager: [
            {
              streaming_profile: 'hd',
              format: 'mp4',
            },
          ],
        },
        (error: any, result: any) => {
          if (error) {
            this.logger.error(
              `Cloudinary upload failed for ${publicId}: ${error.message}`,
            );
            resolve({
              secure_url: '',
              public_id: publicId,
              error: error.message,
            });
          } else if (result) {
            this.logger.log(
              `Clip uploaded successfully: ${publicId} (${result.secure_url})`,
            );
            resolve({
              secure_url: result.secure_url,
              public_id: result.public_id,
              thumbnail_url: this.generateThumbnailUrl(
                result.public_id,
                result.resource_type,
              ),
            });
          } else {
            resolve({
              secure_url: '',
              public_id: publicId,
              error: 'Unknown error',
            });
          }
        },
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  /**
   * Generate thumbnail URL from uploaded video
   * Uses time-based thumbnail generation (0.5 = 50% into video)
   * @param publicId - Cloudinary public ID
   * @param resourceType - Resource type (video)
   * @param timeRatio - Time ratio (0-1) where to capture thumbnail
   */
  private generateThumbnailUrl(
    publicId: string,
    resourceType: string,
    timeRatio: number = 0.5,
  ): string {
    if (resourceType !== 'video') {
      return '';
    }

    // Cloudinary URL format for video thumbnails
    // Using v_offset with percentage-based time
    return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/so_${Math.round(timeRatio * 100)}p/${publicId}.jpg`;
  }

  /**
   * Delete a clip from Cloudinary
   * @param publicId - Cloudinary public ID
   */
  async deleteClip(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      this.logger.log(`Clip deleted from Cloudinary: ${publicId}`);
    } catch (error) {
      this.logger.error(`Failed to delete clip ${publicId}: ${(error as any).message}`);
    }
  }

  /**
   * Delete local temporary file
   * @param filePath - Path to local file
   */
  async deleteLocalFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Local file deleted: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to delete local file ${filePath}: ${(error as any).message}`,
      );
    }
  }

  /**
   * Read file into buffer
   * @param filePath - Path to file
   */
  async readFileToBuffer(filePath: string): Promise<Buffer> {
    return fs.promises.readFile(filePath);
  }
}
