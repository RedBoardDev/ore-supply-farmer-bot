import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { BlockhashWithExpiryBlockHeight, Commitment, Connection } from '@solana/web3.js';

const log = createChildLogger('blockhash-cache');

export interface BlockhashCache {
  start(): void;
  stop(): void;
  invalidate(): void;
  getFreshBlockhash(): Promise<BlockhashWithExpiryBlockHeight>;
}

interface BlockhashCacheOptions {
  connection: Connection;
  commitment: Commitment;
  refreshIntervalMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class BlockhashCacheAdapter implements BlockhashCache {
  private current: BlockhashWithExpiryBlockHeight | null = null;
  private fetchedAt = 0;
  private running = false;
  private inflight: Promise<BlockhashWithExpiryBlockHeight> | null = null;

  constructor(
    private readonly options: BlockhashCacheOptions
  ) { }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.refreshLoop();
  }

  stop(): void {
    this.running = false;
  }

  invalidate(): void {
    this.current = null;
    this.fetchedAt = 0;
  }

  async getFreshBlockhash(): Promise<BlockhashWithExpiryBlockHeight> {
    const age = Date.now() - this.fetchedAt;
    if (this.current && age < this.options.refreshIntervalMs) {
      return this.current;
    }
    await this.refreshOnce();
    if (!this.current) {
      throw new Error('Blockhash cache is empty');
    }
    return this.current;
  }

  private async refreshLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.refreshOnce();
      } catch (error) {
        log.warn(`Failed to refresh blockhash: ${(error as Error).message}`);
      }
      await sleep(this.options.refreshIntervalMs);
    }
  }

  private async refreshOnce(): Promise<BlockhashWithExpiryBlockHeight> {
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = this.options.connection
      .getLatestBlockhash(this.options.commitment)
      .then((result) => {
        this.current = result;
        this.fetchedAt = Date.now();
        return result;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }
}
