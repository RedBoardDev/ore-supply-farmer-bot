import type { HistoricalRound } from '@backtester/domain/entities/historical-round.entity';

export interface HistoricalDataQuery {
  readonly count?: number;
  readonly startRoundId?: bigint;
  readonly endRoundId?: bigint;
  readonly offset?: number;
}

export interface HistoricalDataPort {
  getRounds(query: HistoricalDataQuery): Promise<readonly HistoricalRound[]>;
  getRoundCount(): Promise<number>;
  getLatestRoundId(): Promise<bigint>;
  getOldestRoundId(): Promise<bigint>;
}
