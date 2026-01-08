
import type { PricePort, PriceQuote } from '@osb/bot/domain/services/ports/price.port.d';
import { ORE_TOKEN_ADDRESS, SOL_TOKEN_ADDRESS } from '@osb/bot/infrastructure/constants';
import type { ConfigSchema } from '@osb/config';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const JUPITER_API = 'https://api.jup.ag/v1';

export class LiteJupiterPriceAdapter implements PricePort {
  private readonly config: ConfigSchema;
  private cachedQuote: PriceQuote | null = null;
  private lastFetch: number = 0;

  constructor(config: ConfigSchema) {
    this.config = config;
  }

  getPrice(): PriceQuote | null {
    if (this.isStale(this.config.priceOracle.refreshIntervalMs)) {
      return null;
    }
    return this.cachedQuote;
  }

  async refresh(): Promise<PriceQuote | null> {
    try {
      const response = await fetch(JUPITER_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: [ORE_TOKEN_ADDRESS],
          vsToken: SOL_TOKEN_ADDRESS,
          amount: LAMPORTS_PER_SOL,
        }),
      });

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }

      const json = await response.json();
      const data = json as { data: Array<{ price: number }> };
      const orePerSol = data.data[0]?.price ?? 0;

      if (orePerSol <= 0) {
        throw new Error('Invalid ORE price');
      }

      // 10% fee on ORE value
      // TODO je crois que faut pas ça.
      const netOrePerSol = orePerSol * 0.9;

      this.cachedQuote = {
        orePerSol,
        netOrePerSol,
        fetchedAt: Date.now(),
      };

      this.lastFetch = Date.now();
      return this.cachedQuote;
    } catch (error) {
      console.error('Failed to fetch ORE price:', error);
      return null;
    }
  }

  isStale(maxAgeMs: number): boolean {
    if (!this.cachedQuote) return true;
    return Date.now() - this.lastFetch > maxAgeMs;
  }
}
