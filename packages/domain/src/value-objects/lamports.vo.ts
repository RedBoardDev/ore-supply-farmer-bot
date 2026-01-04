// 1 SOL = 10^9 lamports

export const LAMPORTS_PER_SOL = 1_000_000_000;

export interface LamportsProps {
  readonly value: bigint;
}

export class Lamports {
  private constructor(private readonly _value: bigint) { }

  get value(): bigint {
    return this._value;
  }

  static create(value: bigint): Lamports {
    if (value < 0n) {
      throw new Error("Lamports value cannot be negative");
    }
    return new Lamports(value);
  }

  static fromSol(solAmount: number): Lamports {
    const lamports = BigInt(Math.round(solAmount * LAMPORTS_PER_SOL));
    return Lamports.create(lamports);
  }

  toSol(): number {
    return Number(this._value) / LAMPORTS_PER_SOL;
  }

  add(other: Lamports): Lamports {
    return Lamports.create(this._value + other._value);
  }

  subtract(other: Lamports): Lamports {
    const result = this._value - other._value;
    if (result < 0n) {
      throw new Error("Cannot subtract larger Lamports from smaller");
    }
    return Lamports.create(result);
  }

  multiply(ratio: number): Lamports {
    const result = (this._value * BigInt(Math.round(ratio * LAMPORTS_PER_SOL))) / BigInt(LAMPORTS_PER_SOL);
    return Lamports.create(result);
  }

  equals(other: Lamports): boolean {
    return this._value === other._value;
  }

  greaterThan(other: Lamports): boolean {
    return this._value > other._value;
  }

  lessThan(other: Lamports): boolean {
    return this._value < other._value;
  }

  isZero(): boolean {
    return this._value === 0n;
  }

  toString(): string {
    return `${this._value.toString()} lamports`;
  }
}
