import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async initiateStellar(payoutId: number, amount: number) {
    // 1. Fetch payout record
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { 
        user: {
          include: { wallets: true }
        },
        wallet: true 
      },
    });

    if (!payout) {
      throw new NotFoundException(`Payout with ID ${payoutId} not found`);
    }

    if (payout.status !== 'pending' && payout.status !== 'unpaid' && payout.status !== 'failed') {
      throw new BadRequestException(`Payout is already ${payout.status}`);
    }

    // Determine the destination Stellar address.
    // If payout has a walletId, use that. Otherwise, find the user's Stellar wallet.
    let destinationAddress = payout.wallet?.address;
    if (!destinationAddress) {
      const stellarWallet = payout.user.wallets.find(w => w.chain.toLowerCase() === 'stellar');
      if (!stellarWallet) {
        throw new BadRequestException('User does not have a connected Stellar wallet');
      }
      destinationAddress = stellarWallet.address;
    }

    // 2. Validate sufficient platform balance (future)
    // Placeholder (check platform account balance if configured)

    try {
      // 3. Build Soroban/Horizon payment transaction XDR
      // This is a placeholder for the actual Stellar transaction building.
      // In a real implementation, you'd use '@stellar/stellar-sdk' to build the XDR.
      // Example structure:
      /*
      const sourceKeypair = Keypair.fromSecret(this.config.get('STELLAR_PLATFORM_SECRET'));
      const server = new Horizon.Server(this.config.get('STELLAR_HORIZON_URL'));
      const account = await server.loadAccount(sourceKeypair.publicKey());
      
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.config.get('STELLAR_NETWORK'),
      })
      .addOperation(Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(), // or custom asset
        amount: amount.toString(),
      }))
      .setTimeout(30)
      .build();
      
      transaction.sign(sourceKeypair);
      const transactionXDR = transaction.toXDR();
      const transactionId = transaction.hash().toString('hex');
      */

      // For now, generate a deterministic-looking mock XDR/hash if sdk is not here
      // But we will return something that looks like it's being "prepared"
      const transactionXDR = `Prepared_Stellar_Payment_to_${destinationAddress}_Amount_${amount}_XDR_Placeholder`;
      const transactionId = `txn_${Math.random().toString(36).substring(7)}`;

      // 4. Store transactionId and status = "pending" in Payout model
      const updatedPayout = await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          transactionId: transactionId,
          status: 'pending',
          amount: amount, // optional: sync amount if different
        },
      });

      return {
        payoutId: updatedPayout.id,
        transactionId: updatedPayout.transactionId,
        status: updatedPayout.status,
        xdr: transactionXDR,
      };
    } catch (error) {
      console.error('Failed to prepare Stellar payout:', error);
      throw new InternalServerErrorException('Failed to build payout transaction XDR');
    }
  }
}
