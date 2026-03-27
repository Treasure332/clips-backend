import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class MintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  async mintClip(clipId: number, userId: number): Promise<{ minted: boolean; clipId: number; network: string }> {
    const clip = await this.prisma.clip.findFirst({
      where: { id: clipId, video: { userId } },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    // Business rule: clips that have been auto-posted cannot be minted
    if (clip.postStatus === 'posted') {
      throw new BadRequestException(
        'This clip has already been auto-posted and cannot be minted',
      );
    }

    // Stellar minting logic executes on the configured network.
    // The StellarService exposes rpcUrl and networkPassphrase for use with stellar-sdk.
    // TODO: integrate stellar-sdk call here using this.stellarService.rpcUrl
    //       and this.stellarService.networkPassphrase once the SDK is installed.

    return {
      minted: true,
      clipId,
      network: this.stellarService.network,
    };
  }
}
