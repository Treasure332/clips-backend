import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PayoutService } from './payout.service';
import { InitiatePayoutDto } from './dto/initiate-payout.dto';
import { LoginGuard } from '../auth/guards/login.guard';

@UseGuards(LoginGuard)
@Controller('payouts')
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  /**
   * POST /payouts
   * Initiate a Stellar payout.
   * Returns 400 if the amount is below the minimum threshold (MIN_STELLAR_PAYOUT).
   */
  @Post()
  initiate(@Body() dto: InitiatePayoutDto, @Req() req: Request) {
    const userId = Number((req as any).user?.id ?? 0);
    return this.payoutService.initiatePayout(userId, dto);
  }
}
