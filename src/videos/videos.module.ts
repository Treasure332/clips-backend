import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { ClipsModule } from '../clips/clips.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ClipsModule, PrismaModule],
  controllers: [VideosController],
})
export class VideosModule {}
