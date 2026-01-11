import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { Connection, SlotInfo } from '@solana/web3.js';

export interface SlotCache {
  getSlot(): number;
  getSlotSync(): number;
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

const log = createChildLogger('slot-cache');

export class SlotCacheAdapter implements SlotCache {
  private currentSlot = 0;
  private lastUpdatedAt = 0;
  private running = false;
  private subscriptionId: number | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshInFlight: Promise<void> | null = null;

  constructor(private readonly connection: Connection) {}

  getSlot(): number {
    void this.refreshIfStale('getSlot');
    return this.currentSlot;
  }

  getSlotSync(): number {
    void this.refreshIfStale('getSlotSync');
    return this.currentSlot;
  }

  start(): void {
    if (this.running) return;

    // Get initial slot
    this.refreshFromRpc('initial')
      .then(() => {
        if (this.currentSlot > 0) {
          log.debug(`Slot cache initialized at ${this.currentSlot}`);
        }
      })
      .catch(() => {
        log.debug('Unable to get initial slot for cache');
      });

    // Subscribe to slot updates
    this.subscriptionId = this.connection.onSlotChange((slotInfo: SlotInfo) => {
      this.currentSlot = slotInfo.slot;
      this.lastUpdatedAt = Date.now();
    });

    // Fallback refresh in case WS stalls
    this.refreshTimer = setInterval(() => {
      void this.refreshIfStale('timer');
    }, 500);

    this.running = true;
    log.debug('Slot cache started');
  }

  stop(): void {
    if (!this.running) return;

    if (this.subscriptionId !== null) {
      this.connection.removeSlotChangeListener(this.subscriptionId).catch(() => {});
      this.subscriptionId = null;
    }

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.running = false;
    log.debug('Slot cache stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  private async refreshIfStale(source: 'getSlot' | 'getSlotSync' | 'timer'): Promise<void> {
    if (!this.running) {
      return;
    }

    const now = Date.now();
    const ageMs = this.lastUpdatedAt === 0 ? Number.POSITIVE_INFINITY : now - this.lastUpdatedAt;

    if (this.currentSlot === 0 || ageMs > 800) {
      await this.refreshFromRpc(source);
    }
  }

  private async refreshFromRpc(source: 'initial' | 'getSlot' | 'getSlotSync' | 'timer'): Promise<void> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.connection
      .getSlot()
      .then((slot) => {
        this.currentSlot = slot;
        this.lastUpdatedAt = Date.now();
        if (source !== 'timer') {
          log.debug(`Slot cache refreshed via RPC (${source}): ${slot}`);
        }
      })
      .catch(() => {
        if (source !== 'timer') {
          log.debug(`Slot cache RPC refresh failed (${source})`);
        }
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }
}
