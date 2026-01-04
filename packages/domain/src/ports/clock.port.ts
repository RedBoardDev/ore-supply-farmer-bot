import type { Slot } from '@osb/domain/value-objects/slot.vo';

export interface ClockPort {
  now(): number;
  currentSlot(): Slot;
  sleep(ms: number): Promise<void>;
  slotsPerSecond(): number;
}
