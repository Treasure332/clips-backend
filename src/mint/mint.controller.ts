import { Controller, Post, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { MintService } from './mint.service';
import { LoginGuard } from '../auth/guards/login.guard';

@UseGuards(LoginGuard)
@Controller('clips')
export class MintController {
  constructor(private readonly mintService: MintService) {}

  /**
   * POST /clips/:id/mint
   * Mint a clip as an NFT on Stellar.
   * Returns 400 if the clip has already been auto-posted.
   */
  @Post(':id/mint')
  mint(@Param('id') id: string, @Req() req: Request) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.mintService.mintClip(Number(id), userId);
  }
}
