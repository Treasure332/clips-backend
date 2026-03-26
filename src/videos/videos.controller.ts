import { Controller, Post, Param, UseGuards, Get } from '@nestjs/common';
import { ClipsService } from '../clips/clips.service';
import { LoginGuard } from '../auth/guards/login.guard.js';
import { ClipsService } from '../clips/clips.service.js';
import { CreateVideoDto } from './dto/create-video.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@UseGuards(LoginGuard)
@Controller('videos')
export class VideosController {
  constructor(private readonly clipsService: ClipsService) {}

  @Get()
  getVideos() {
    return { message: 'Videos endpoint' };
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.clipsService.cancelVideo(id);
  }
}
