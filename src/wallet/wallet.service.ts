import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mask a wallet address for privacy, showing only the last 6 characters.
   * e.g. "GBXZFVGP3QW5NXVZ4KPRQ" → "******NXVZ4KPRQ" → "******KPRQ"  (last 6)
   */
  maskAddress(address: string): string {
    if (!address) return '';
    if (address.length <= 6) return address;
    return `******${address.slice(-6)}`;
  }

  private applyMask(wallet: any) {
    return { ...wallet, address: this.maskAddress(wallet.address) };
  }

  async getWalletsByUserId(userId: number) {
    const wallets = await this.prisma.wallet.findMany({ where: { userId } });
    return wallets.map((w) => this.applyMask(w));
  }

  async getWalletById(id: number, userId: number) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id, userId },
    });
    if (!wallet) throw new NotFoundException(`Wallet ${id} not found`);
    return this.applyMask(wallet);
  }
}
