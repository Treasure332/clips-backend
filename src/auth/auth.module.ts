import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './strategies/google.strategy';
import { IsStrongPasswordConstraint } from './validators/is-strong-password.validator';
import { MailService } from './mail.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ session: false }),
    JwtModule.registerAsync({
      useFactory: () => {
        const expires =
          Number(process.env.JWT_EXPIRES) && Number(process.env.JWT_EXPIRES) > 0
            ? Number(process.env.JWT_EXPIRES)
            : 3600;
        return {
          secret: process.env.JWT_SECRET || 'dev_jwt_secret',
          signOptions: { expiresIn: expires },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, IsStrongPasswordConstraint, MailService],
})
export class AuthModule {}
