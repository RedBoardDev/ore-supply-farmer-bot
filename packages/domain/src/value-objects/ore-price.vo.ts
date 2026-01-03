// 10% fee on ORE value
export const ORE_FEES = 0.9;

export interface OrePriceProps {
  readonly orePerSol: number;
  readonly netOrePerSol: number;
  readonly fetchedAt: number;
}

export class OrePrice {
  private constructor(private readonly _orePerSol: number, private readonly _netOrePerSol: number, private readonly _fetchedAt: number) { }

  get orePerSol(): number {
    return this._orePerSol;
  }

  get netOrePerSol(): number {
    return this._netOrePerSol;
  }

  get fetchedAt(): number {
    return this._fetchedAt;
  }

  static create(orePerSol: number, netOrePerSol: number, fetchedAt: number): OrePrice {
    if (orePerSol <= 0) {
      throw new Error('ORE price must be positive');
    }
    if (netOrePerSol <= 0) {
      throw new Error('Net ORE price must be positive');
    }
    if (fetchedAt <= 0) {
      throw new Error('Fetch timestamp must be positive');
    }
    return new OrePrice(orePerSol, netOrePerSol, fetchedAt);
  }

  static fromQuotes(oreUsd: number, solUsd: number, fetchedAt: number): OrePrice {
    const orePerSol = oreUsd / solUsd;
    const feeFactor = ORE_FEES;
    const netOrePerSol = orePerSol * feeFactor;
    return OrePrice.create(orePerSol, netOrePerSol, fetchedAt);
  }

  isStale(maxAgeMs: number): boolean {
    return Date.now() - this._fetchedAt > maxAgeMs;
  }

  equals(other: OrePrice): boolean {
    return this._orePerSol === other._orePerSol && this._netOrePerSol === other._netOrePerSol;
  }

  toString(): string {
    return `ORE: ${this._orePerSol.toFixed(6)} SOL (net: ${this._netOrePerSol.toFixed(6)} SOL)`;
  }
}
