import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { ClipGenerationProcessor } from './clip-generation.processor';
import { CloudinaryService } from './cloudinary.service';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';

@Module({
  imports: [
    BullModule.registerQueue({ name: CLIP_GENERATION_QUEUE }),
  ],
  controllers: [ClipsController],
  providers: [ClipsService, ClipGenerationProcessor, CloudinaryService],
  exports: [ClipsService, CloudinaryService],
})
export class ClipsModule {}
