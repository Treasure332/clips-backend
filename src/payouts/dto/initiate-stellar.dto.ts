import { IsNumber, IsNotEmpty } from 'class-validator';

export class InitiateStellarPayoutDto {
  @IsNumber()
  @IsNotEmpty()
  payoutId: number;

  @IsNumber()
  @IsNotEmpty()
  amount: number;
}
