import type { LatencyRecord } from '@osb/domain/services/latency.service';

export interface StoragePort {
  // Checkpoints
  saveCheckpoint(roundId: bigint, data: Uint8Array): Promise<void>;
  loadCheckpoint(roundId: bigint): Promise<Uint8Array | null>;

  // Latency
  recordLatency(record: LatencyRecord): Promise<void>;
  getLatencyHistory(limit?: number): Promise<LatencyRecord[]>;

  // General state
  saveState(key: string, data: unknown): Promise<void>;
  loadState(key: string): Promise<unknown | null>;
}
