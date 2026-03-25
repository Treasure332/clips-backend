
import { Controller, UseGuards, Get } from '@nestjs/common';
import { LoginGuard } from '../auth/guards/login.guard.js';

@UseGuards(LoginGuard)
@Controller('videos')
export class VideosController {
    @Get()
    getVideos() {
        return { message: 'Videos endpoint' };
    }

import { Controller, Post, Param } from '@nestjs/common';
import { ClipsService } from '../clips/clips.service';

@Controller('videos')
export class VideosController {
  constructor(private readonly clipsService: ClipsService) {}

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.clipsService.cancelVideo(id);
  }

}
