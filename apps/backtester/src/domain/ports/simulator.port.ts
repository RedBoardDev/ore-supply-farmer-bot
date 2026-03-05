import type { BacktestResult } from '@backtester/domain/aggregates/backtest-result.aggregate';
import type { HistoricalRound } from '@backtester/domain/entities/historical-round.entity';
import type { SimulatedRound } from '@backtester/domain/entities/simulated-round.entity';
import type { BacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';

export interface SimulationContext {
  readonly config: BacktestConfig;
  readonly initialBalanceLamports: bigint;
}

export interface SimulatorPort {
  simulateRound(round: HistoricalRound, context: SimulationContext, currentBalanceLamports: bigint): SimulatedRound;

  simulateBatch(rounds: readonly HistoricalRound[], context: SimulationContext): Promise<BacktestResult>;
}
