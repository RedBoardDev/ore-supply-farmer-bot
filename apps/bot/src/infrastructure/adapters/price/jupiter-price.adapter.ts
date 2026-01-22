import type { PricePort, PriceQuote } from '@osb/bot/domain/services/ports/price.port';
import type { EnvSchema } from '@osb/config/env';
import { ORE_TOKEN_ADDRESS, SOL_TOKEN_ADDRESS } from '../../constants';

const JUPITER_V3_API = 'https://api.jup.ag/price/v3';
const DEFAULT_FETCH_TIMEOUT_MS = 1500;
const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

interface JupiterV3PriceResponse {
  [address: string]: { usdPrice: number | string };
}

export class JupiterPriceAdapter implements PricePort {
  private cachedQuote: PriceQuote | null = null;
  private lastFetch: number = 0;
  private inflight: Promise<PriceQuote | null> | null = null;
  private consecutiveFailures = 0;

  constructor(private readonly env: EnvSchema) {}

  getPrice(): PriceQuote | null {
    return this.cachedQuote;
  }

  async refresh(): Promise<PriceQuote | null> {
    if (this.inflight) {
      return this.inflight;
    }

    if (!this.isStale(DEFAULT_REFRESH_INTERVAL_MS) && this.cachedQuote) {
      return this.cachedQuote;
    }

    const start = Date.now();
    this.inflight = this.fetchQuote()
      .then((quote) => {
        const duration = Date.now() - start;
        if (quote) {
          this.cachedQuote = quote;
          this.lastFetch = Date.now();
          this.consecutiveFailures = 0;
        } else {
          this.consecutiveFailures += 1;
          if (this.consecutiveFailures % 3 === 0) {
            console.warn(
              `Price refresh failed ${this.consecutiveFailures} times; using cached quote if available (duration=${duration}ms)`,
            );
          }
        }
        return quote;
      })
      .finally(() => {
        this.inflight = null;
      });

    return this.inflight;
  }

  isStale(maxAgeMs: number): boolean {
    if (!this.cachedQuote) return true;
    return Date.now() - this.lastFetch > maxAgeMs;
  }

  private async fetchQuote(): Promise<PriceQuote | null> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => {
          controller.abort();
        }, DEFAULT_FETCH_TIMEOUT_MS)
      : null;

    try {
      const url = new URL(JUPITER_V3_API);
      url.searchParams.set('ids', [ORE_TOKEN_ADDRESS.toBase58(), SOL_TOKEN_ADDRESS.toBase58()].join(','));

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': this.env.JUPITER_API_KEY,
        },
        signal: controller?.signal,
      });

      const json = (await response.json()) as unknown;

      if (
        !response.ok ||
        'error' in (json as Record<string, unknown>) ||
        'message' in (json as Record<string, unknown>)
      ) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }

      const data = json as JupiterV3PriceResponse;
      const oreAddr = ORE_TOKEN_ADDRESS.toBase58();
      const solAddr = SOL_TOKEN_ADDRESS.toBase58();

      const oreData = data[oreAddr];
      const solData = data[solAddr];
      if (!oreData || !solData) {
        throw new Error(`Tokens not found in Jupiter response`);
      }

      const oreUsdPrice = Number(oreData.usdPrice);
      const solUsdPrice = Number(solData.usdPrice);

      if (!Number.isFinite(oreUsdPrice) || !Number.isFinite(solUsdPrice) || oreUsdPrice <= 0 || solUsdPrice <= 0) {
        throw new Error(`Invalid prices: ORE=${oreUsdPrice}, SOL=${solUsdPrice}`);
      }

      const solPerOre = oreUsdPrice / solUsdPrice;
      const netSolPerOre = solPerOre * 0.9;

      return {
        solPerOre,
        netSolPerOre,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      if ((error as Error)?.message !== 'The operation was aborted.') {
        console.error('Failed to fetch ORE price:', error);
      }
      return null;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
