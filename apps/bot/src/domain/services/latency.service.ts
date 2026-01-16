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

export interface LatencyService {
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

interface LatencyTrackerOptions {
  slotDurationMs: number;
  smoothing?: number;
  initialPrepMs?: number;
  initialExecPerPlacementMs?: number;
  maxSamples?: number;
}

const MIN_VALID_EXEC_MS = 20;

export class LatencyServiceAdapter implements LatencyService {
  private prepAvgMs: number;
  private execAvgPerPlacementMs: number;
  private readonly slotDurationMs: number;
  private readonly smoothing: number;
  private readonly maxSamples: number;
  private readonly prepSamples: number[] = [];
  private readonly execSamples: number[] = [];
  private initialized = false;

  constructor(options: LatencyTrackerOptions) {
    this.slotDurationMs = options.slotDurationMs;
    this.smoothing = options.smoothing ?? 0.2;
    this.prepAvgMs = options.initialPrepMs ?? 400;
    this.execAvgPerPlacementMs = options.initialExecPerPlacementMs ?? 160;
    this.maxSamples = options.maxSamples ?? 200;
  }

  record(placements: number, prepMs: number, execMs: number): void {
    if (prepMs > 0) {
      this.recordSample(this.prepSamples, prepMs);
      this.mixPrep(prepMs);
    }

    if (placements <= 0 || execMs <= 0) {
      return;
    }

    const execPerPlacement = execMs / placements;
    if (execPerPlacement < MIN_VALID_EXEC_MS) {
      return;
    }

    this.recordSample(this.execSamples, execPerPlacement);
    this.mixExec(execPerPlacement);
    this.initialized = true;
  }

  estimateSlots(options: {
    expectedPlacements: number;
    minSlots: number;
    maxSlots: number;
    safetySlots: number;
    overheadPerPlacementMs?: number;
    parallelismFactor?: number;
  }): number {
    const prep = this.getGuardedValue(this.prepAvgMs, this.prepSamples);
    const execPerPlacement = this.getGuardedValue(this.execAvgPerPlacementMs, this.execSamples);
    const execP95 = this.getPercentile(this.execSamples, 0.95);
    const execGuard = execP95 ?? execPerPlacement;

    const placements = Math.max(1, options.expectedPlacements);
    const overhead = Number.isFinite(options.overheadPerPlacementMs ?? NaN)
      ? Math.max(0, Math.min(options.overheadPerPlacementMs as number, 200))
      : 10;
    const parallelismFactor = Number.isFinite(options.parallelismFactor ?? NaN)
      ? Math.max(1, Math.min(options.parallelismFactor as number, 5))
      : 1.5;

    const execTotal = execGuard * parallelismFactor + overhead * Math.max(0, placements - 1);
    const totalMs = prep + execTotal;
    const slots = Math.ceil(totalMs / this.slotDurationMs);
    const withSafety = slots + options.safetySlots;
    return Math.max(options.minSlots, Math.min(options.maxSlots, withSafety));
  }

  getSnapshot(): LatencySnapshot {
    const prepP95 = this.getPercentile(this.prepSamples, 0.95);
    const execP95 = this.getPercentile(this.execSamples, 0.95);
    return {
      prepMs: this.prepAvgMs,
      execPerPlacementMs: this.execAvgPerPlacementMs,
      prepP95Ms: prepP95,
      execP95Ms: execP95,
      initialized: this.initialized,
    };
  }

  restoreFromHistory(records: LatencyRecord[]): void {
    for (const record of records) {
      this.record(record.placementCount, record.prepMs, record.executionMs);
    }
  }

  private mixPrep(value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    this.prepAvgMs = this.mix(this.prepAvgMs, value);
  }

  private mixExec(value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    this.execAvgPerPlacementMs = this.mix(this.execAvgPerPlacementMs, value);
  }

  private mix(current: number, measurement: number): number {
    if (!this.initialized) {
      return measurement;
    }
    return current * (1 - this.smoothing) + measurement * this.smoothing;
  }

  private recordSample(store: number[], value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    store.push(value);
    if (store.length > this.maxSamples) {
      store.splice(0, store.length - this.maxSamples);
    }
  }

  private getPercentile(values: number[], percentile: number): number | null {
    if (values.length === 0) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(percentile * (sorted.length - 1))));
    const result = sorted[index];
    return result ?? null;
  }

  private getGuardedValue(avg: number, samples: number[]): number {
    const percentile = this.getPercentile(samples, 0.95);
    if (percentile === null) {
      return avg;
    }
    return Math.max(avg, percentile);
  }
}

export interface LatencyStoragePort {
  load(): Promise<LatencyRecord[]>;
  enqueue(record: LatencyRecord): void;
  flush(): Promise<void>;
}

export class FileLatencyStorage implements LatencyStoragePort {
  private readonly path: string;
  private readonly maxEntries: number;
  private readonly flushIntervalMs: number;
  private records: LatencyRecord[] = [];
  private pendingFlush = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushingPromise: Promise<void> | null = null;

  constructor(options: { path: string; maxEntries: number; flushIntervalMs: number }) {
    this.path = options.path;
    this.maxEntries = options.maxEntries;
    this.flushIntervalMs = options.flushIntervalMs;
  }

  async load(): Promise<LatencyRecord[]> {
    try {
      const fs = await import('node:fs/promises');
      const raw = await fs.readFile(this.path, 'utf8');
      const lines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      this.records = lines
        .map((line) => {
          try {
            const parsed = JSON.parse(line) as Omit<LatencyRecord, 'roundId'> & { roundId: string };
            return {
              ...parsed,
              roundId: BigInt(parsed.roundId),
            } as LatencyRecord;
          } catch {
            return null;
          }
        })
        .filter((value): value is LatencyRecord => value !== null);
      if (this.records.length > this.maxEntries) {
        this.records.splice(0, this.records.length - this.maxEntries);
      }
    } catch (error) {
      const nodeError = error as { code?: string };
      if (nodeError.code !== 'ENOENT') {
        throw error;
      }
      this.records = [];
    }
    return this.records;
  }

  enqueue(record: LatencyRecord): void {
    this.records.push(record);
    if (this.records.length > this.maxEntries) {
      this.records.splice(0, this.records.length - this.maxEntries);
    }
    this.pendingFlush = true;
    this.scheduleFlush();
  }

  async flush(): Promise<void> {
    if (!this.pendingFlush && !this.flushingPromise) {
      return;
    }
    if (this.flushingPromise) {
      await this.flushingPromise;
      return;
    }
    this.pendingFlush = false;
    this.flushingPromise = this.persist().finally(() => {
      this.flushingPromise = null;
    });
    await this.flushingPromise;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush().catch(() => {});
    }, this.flushIntervalMs);
  }

  private async persist(): Promise<void> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    await fs.mkdir(path.dirname(path.resolve(this.path)), { recursive: true });
    const payload = this.records
      .slice(-this.maxEntries)
      .map((record) =>
        JSON.stringify({
          ...record,
          roundId: record.roundId.toString(),
        }),
      )
      .join('\n')
      .concat(this.records.length > 0 ? '\n' : '');
    await fs.writeFile(this.path, payload, 'utf8');
  }
}
