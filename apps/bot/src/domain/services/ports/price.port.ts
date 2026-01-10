export interface PriceQuote {
  readonly solPerOre: number;
  readonly netSolPerOre: number;
  readonly fetchedAt: number;
}

export interface PricePort {
  getPrice(): PriceQuote | null;
  refresh(): Promise<PriceQuote | null>;
  isStale(maxAgeMs: number): boolean;
}
