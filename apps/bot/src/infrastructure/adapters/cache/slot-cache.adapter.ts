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
  private running = false;
  private subscriptionId: number | null = null;

  constructor(private readonly connection: Connection) { }

  getSlot(): number {
    return this.currentSlot;
  }

  getSlotSync(): number {
    return this.currentSlot;
  }

  start(): void {
    if (this.running) return;

    // Get initial slot
    this.connection.getSlot().then(slot => {
      this.currentSlot = slot;
      log.debug(`Slot cache initialized at ${slot}`);
    }).catch(() => {
      log.debug('Unable to get initial slot for cache');
    });

    // Subscribe to slot updates
    this.subscriptionId = this.connection.onSlotChange((slotInfo: SlotInfo) => {
      this.currentSlot = slotInfo.slot;
    });

    this.running = true;
    log.debug('Slot cache started');
  }

  stop(): void {
    if (!this.running) return;

    if (this.subscriptionId !== null) {
      this.connection.removeSlotChangeListener(this.subscriptionId).catch(() => { });
      this.subscriptionId = null;
    }

    this.running = false;
    log.debug('Slot cache stopped');
  }

  isRunning(): boolean {
    return this.running;
  }
}
