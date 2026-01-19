export interface LatencyRecord {
  readonly roundId: bigint;
  readonly prepMs: number;
  readonly executionMs: number;
  readonly placementCount: number;
  readonly timestamp: number;
}

export interface LatencySnapshot {
  readonly prepMs: number;
  readonly execPerPlacementMs: number;
  readonly prepP95Ms: number | null;
  readonly execP95Ms: number | null;
  readonly initialized: boolean;
}

export interface LatencyServicePort {
  record(placements: number, prepMs: number, execMs: number): void;
  getSnapshot(): LatencySnapshot;
  estimateSlots(options: {
    expectedPlacements: number;
    minSlots: number;
    maxSlots: number;
    safetySlots: number;
    overheadPerPlacementMs?: number;
    parallelismFactor?: number;
  }): number;
  restoreFromHistory(records: LatencyRecord[]): void;
}

export interface LatencyStoragePort {
  load(): Promise<LatencyRecord[]>;
  enqueue(record: LatencyRecord): void;
  flush(): Promise<void>;
}
