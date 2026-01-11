import type { PricePort, PriceQuote } from '@osb/bot/domain/services/ports/price.port';
import type { EnvSchema } from '@osb/config/env';
import { ORE_TOKEN_ADDRESS, SOL_TOKEN_ADDRESS } from '../../constants';

/** @deprecated move to V3 */
const JUPITER_API = 'https://api.jup.ag/price/v2';
const DEFAULT_FETCH_TIMEOUT_MS = 1500;
const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

interface JupiterPriceResponse {
  data: Record<string, { price: number | string }>;
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
      const url = new URL(JUPITER_API);
      url.searchParams.set('ids', ORE_TOKEN_ADDRESS.toBase58());
      url.searchParams.set('vsToken', SOL_TOKEN_ADDRESS.toBase58());

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': this.env.JUPITER_API_KEY,
        },
        signal: controller?.signal,
      });

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }

      const json = (await response.json()) as JupiterPriceResponse;
      const priceRaw = json.data?.[ORE_TOKEN_ADDRESS.toBase58()]?.price;
      const solPerOre = typeof priceRaw === 'string' ? Number.parseFloat(priceRaw) : (priceRaw ?? 0);

      if (solPerOre <= 0) {
        throw new Error('Invalid ORE price');
      }

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
