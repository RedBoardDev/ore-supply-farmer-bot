export type MiningDecision = 'MINE' | 'SKIP';

export interface MiningCostInput {
  roundId?: bigint;
}

export interface MiningCostResult {
  decision: MiningDecision;
  evPercent: number | null;
  averageEvPercent: number | null;
}

export interface MiningCostConfig {
  enabled: boolean;
  thresholdPercent: number;
  historyRounds: number;
}

export interface MiningCostStrategyPort {
  isEnabled(): boolean;
  evaluate(input: MiningCostInput): Promise<MiningCostResult>;
}
