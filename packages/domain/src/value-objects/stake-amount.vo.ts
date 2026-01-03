import type { Lamports } from "./lamports.vo";

export interface StakeAmountProps {
  readonly value: Lamports;
}

export class StakeAmount {
  private constructor(
    private readonly _value: Lamports,
    private readonly _isMinimum: boolean,
    private readonly _isCapped: boolean,
  ) {}

  get value(): Lamports {
    return this._value;
  }

  get isMinimum(): boolean {
    return this._isMinimum;
  }

  get isCapped(): boolean {
    return this._isCapped;
  }

  static minimum(value: Lamports): StakeAmount {
    return new StakeAmount(value, true, false);
  }

  static normal(value: Lamports, isCapped: boolean): StakeAmount {
    return new StakeAmount(value, false, isCapped);
  }

  static highEV(value: Lamports, isCapped: boolean): StakeAmount {
    return new StakeAmount(value, false, isCapped);
  }

  equals(other: StakeAmount): boolean {
    return this._value.equals(other._value);
  }

  toString(): string {
    const suffix = this._isMinimum ? " (min)" : this._isCapped ? " (capped)" : "";
    return `Stake${suffix}: ${this._value.toString()}`;
  }
}
