export class RoundId {
  private constructor(private readonly _value: bigint) { }

  get value(): bigint {
    return this._value;
  }

  static create(value: bigint): RoundId {
    if (value < 0n) {
      throw new Error('RoundId cannot be negative');
    }
    return new RoundId(value);
  }

  static next(currentId: bigint): RoundId {
    return new RoundId(currentId + 1n);
  }

  equals(other: RoundId): boolean {
    return this._value === other._value;
  }

  greaterThan(other: RoundId): boolean {
    return this._value > other._value;
  }

  lessThan(other: RoundId): boolean {
    return this._value < other._value;
  }

  toString(): string {
    return `Round #${this._value.toString()}`;
  }
}
