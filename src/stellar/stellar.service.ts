import { Injectable, Logger } from '@nestjs/common';

export type StellarNetwork = 'testnet' | 'public';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);

  readonly network: StellarNetwork;
  readonly rpcUrl: string;
  readonly networkPassphrase: string;

  constructor() {
    const raw = (process.env.STELLAR_NETWORK ?? 'testnet').toLowerCase();
    this.network = raw === 'public' ? 'public' : 'testnet';

    if (this.network === 'public') {
      this.rpcUrl = 'https://soroban-rpc.stellar.org';
      this.networkPassphrase = 'Public Global Stellar Network ; September 2015';
    } else {
      this.rpcUrl = 'https://soroban-testnet.stellar.org';
      this.networkPassphrase = 'Test SDF Network ; September 2015';
    }

    this.logger.log(
      `Stellar SDK configured for network="${this.network}" rpc="${this.rpcUrl}"`,
    );
  }

  isTestnet(): boolean {
    return this.network === 'testnet';
  }

  isMainnet(): boolean {
    return this.network === 'public';
  }
}
