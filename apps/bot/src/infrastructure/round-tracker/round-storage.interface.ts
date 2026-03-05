import type { RoundData } from './round.model';

export interface RoundStoragePort {
  saveRound(round: RoundData): Promise<void>;
  getRound(roundId: string): Promise<RoundData | null>;
  getRounds(limit?: number): Promise<RoundData[]>;
  updateRound(roundId: string, updates: Partial<RoundData>): Promise<void>;
}
