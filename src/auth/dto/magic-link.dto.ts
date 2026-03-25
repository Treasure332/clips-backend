import { IsEmail, IsNotEmpty } from 'class-validator';

export class MagicLinkRequestDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
