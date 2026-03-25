import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  UseGuards,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { MagicLinkRequestDto } from './dto/magic-link.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body(new ValidationPipe({ transform: true })) signupDto: SignupDto) {
    try {
      return await this.authService.signup(signupDto);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Signup failed');
    }
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    return;
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any) {
    const user = req.user;
    const tokens = this.authService.issueTokens({
      id: user.id,
      email: user.email ?? null,
    });
    return { user, tokens };
  }

  @Post('magic-link')
  async requestMagicLink(
    @Body(new ValidationPipe({ transform: true })) dto: MagicLinkRequestDto,
  ) {
    await this.authService.requestMagicLink(dto.email);
    // Always return 200 to avoid email enumeration
    return { message: 'If that email exists, a magic link has been sent.' };
  }

  @Get('verify-magic')
  async verifyMagicLink(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    return this.authService.verifyMagicLink(token);
  }
}
