import { IsNumber, IsPositive, IsInt, IsOptional } from 'class-validator';

export class InitiatePayoutDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsInt()
  @IsOptional()
  walletId?: number;
}
