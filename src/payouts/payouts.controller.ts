import { Controller, Post, Body, UseGuards, ValidationPipe } from '@nestjs/common';
import { LoginGuard } from '../auth/guards/login.guard';
import { PayoutsService } from './payouts.service';
import { InitiateStellarPayoutDto } from './dto/initiate-stellar.dto';

@UseGuards(LoginGuard)
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post('initiate-stellar')
  async initiateStellar(
    @Body(new ValidationPipe({ transform: true })) dto: InitiateStellarPayoutDto,
  ) {
    return this.payoutsService.initiateStellar(dto.payoutId, dto.amount);
  }
}
