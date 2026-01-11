// 10% fee on ORE value
export const ORE_FEES = 0.9;

export interface OrePriceProps {
  readonly solPerOre: number;
  readonly netSolPerOre: number;
  readonly fetchedAt: number;
}

export class OrePrice {
  private constructor(
    private readonly _solPerOre: number,
    private readonly _netSolPerOre: number,
    private readonly _fetchedAt: number,
  ) {}

  get solPerOre(): number {
    return this._solPerOre;
  }

  get netSolPerOre(): number {
    return this._netSolPerOre;
  }

  get fetchedAt(): number {
    return this._fetchedAt;
  }

  static create(solPerOre: number, netSolPerOre: number, fetchedAt: number): OrePrice {
    if (solPerOre <= 0) {
      throw new Error('ORE price must be positive');
    }
    if (netSolPerOre <= 0) {
      throw new Error('Net ORE price must be positive');
    }
    if (fetchedAt <= 0) {
      throw new Error('Fetch timestamp must be positive');
    }
    return new OrePrice(solPerOre, netSolPerOre, fetchedAt);
  }

  static fromQuotes(oreUsd: number, solUsd: number, fetchedAt: number): OrePrice {
    const solPerOre = oreUsd / solUsd;
    const feeFactor = ORE_FEES;
    const netSolPerOre = solPerOre * feeFactor;
    return OrePrice.create(solPerOre, netSolPerOre, fetchedAt);
  }

  isStale(maxAgeMs: number): boolean {
    return Date.now() - this._fetchedAt > maxAgeMs;
  }

  equals(other: OrePrice): boolean {
    return this._solPerOre === other._solPerOre && this._netSolPerOre === other._netSolPerOre;
  }

  toString(): string {
    return `1 ORE = ${this._solPerOre.toFixed(6)} SOL (net: ${this._netSolPerOre.toFixed(6)} SOL)`;
  }
}
