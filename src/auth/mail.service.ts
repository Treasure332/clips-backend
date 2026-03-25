import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendMagicLink(email: string, token: string): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const link = `${baseUrl}/auth/verify-magic?token=${token}`;

    const info = await this.transporter.sendMail({
      from: process.env.SMTP_FROM || '"Clips App" <noreply@clips.app>',
      to: email,
      subject: 'Your magic login link',
      text: `Click the link below to log in (expires in 15 minutes):\n\n${link}`,
      html: `
        <p>Click the button below to log in. This link expires in <strong>15 minutes</strong>.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none;">Log in</a>
        <p>Or copy this URL: ${link}</p>
      `,
    });

    this.logger.log(`Magic link sent to ${email} — messageId: ${info.messageId}`);
  }
}
