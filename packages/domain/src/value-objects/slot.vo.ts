// SLOTS_PER_SECOND = 2.5 as per the ORE protocol
export const SLOTS_PER_SECOND = 2.5;
export const SLOT_DURATION_MS = Math.round(1_000 / SLOTS_PER_SECOND);

export class Slot {
  private constructor(private readonly _value: bigint) {}

  get value(): bigint {
    return this._value;
  }

  static create(value: bigint): Slot {
    if (value < 0n) {
      throw new Error("Slot value cannot be negative");
    }
    return new Slot(value);
  }

  static fromMs(ms: number): Slot {
    const slots = BigInt(Math.round(ms / SLOT_DURATION_MS));
    return Slot.create(slots);
  }

  toMs(): number {
    return Number(this._value) * SLOT_DURATION_MS;
  }

  toSeconds(): number {
    return Number(this._value) / SLOTS_PER_SECOND;
  }

  isBefore(other: Slot): boolean {
    return this._value < other._value;
  }

  isAfter(other: Slot): boolean {
    return this._value > other._value;
  }

  slotsUntil(other: Slot): bigint {
    if (other._value <= this._value) {
      return 0n;
    }
    return other._value - this._value;
  }

  msUntil(other: Slot): number {
    return Number(this.slotsUntil(other)) * SLOT_DURATION_MS;
  }

  equals(other: Slot): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return `Slot ${this._value.toString()}`;
  }
}
