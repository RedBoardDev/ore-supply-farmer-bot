import type { ClockPort } from '../ports/clock.port';
import { SLOTS_PER_SECOND, Slot } from '../value-objects/slot.vo';

export class DefaultClock implements ClockPort {
  private readonly _slotsPerSecond: number;
  private readonly _slotDurationMs: number;

  constructor(slotsPerSecondParam: number = SLOTS_PER_SECOND) {
    this._slotsPerSecond = slotsPerSecondParam;
    this._slotDurationMs = Math.round(1_000 / slotsPerSecondParam);
  }

  now(): number {
    return Date.now();
  }

  currentSlot(): Slot {
    const slot = BigInt(Math.floor(this.now() / this._slotDurationMs));
    return Slot.create(slot);
  }

  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  slotsPerSecond(): number {
    return this._slotsPerSecond;
  }

  msToSlots(ms: number): bigint {
    return BigInt(Math.round(ms / this._slotDurationMs));
  }

  slotsToMs(slots: bigint): number {
    return Number(slots) * this._slotDurationMs;
  }
}
