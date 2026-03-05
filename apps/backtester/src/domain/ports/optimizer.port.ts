import type { BacktestMetrics } from '@backtester/domain/aggregates/backtest-result.aggregate';
import type { HistoricalRound } from '@backtester/domain/entities/historical-round.entity';
import type { BacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';
import type { ParameterBounds } from '@backtester/domain/value-objects/optimization-bounds.vo';

export interface OptimizationParams {
  readonly initialBudgetSol: number;
  readonly bounds: ParameterBounds;
  readonly maxIterations: number;
  readonly convergenceThreshold: number;
  readonly subSampleSize: number | null;
}

export interface ConfigEvaluation {
  readonly config: BacktestConfig;
  readonly metrics: BacktestMetrics;
  readonly iteration: number;
}

export interface OptimizationResult {
  readonly bestConfig: BacktestConfig;
  readonly bestMetrics: BacktestMetrics;
  readonly iterations: number;
  readonly allResults: readonly ConfigEvaluation[];
  readonly convergenceHistory: readonly number[];
  readonly elapsedMs: number;
}

export interface OptimizerPort {
  optimize(
    data: readonly HistoricalRound[],
    params: OptimizationParams,
    baseConfig: BacktestConfig,
  ): Promise<OptimizationResult>;
}
