import { Controller, UseGuards, Get } from '@nestjs/common';
import { LoginGuard } from '../auth/guards/login.guard.js';

@UseGuards(LoginGuard)
@Controller('earnings')
export class EarningsController {
    @Get()
    getEarnings() {
        return { message: 'Earnings endpoint' };
    }
}
