export interface PriceQuote {
  readonly orePerSol: number;
  readonly netOrePerSol: number;
  readonly fetchedAt: number;
}

export interface PricePort {
  getPrice(): PriceQuote | null;
  refresh(): Promise<PriceQuote | null>;
  isStale(maxAgeMs: number): boolean;
}
