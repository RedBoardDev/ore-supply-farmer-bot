import type { HistoricalRound } from '@backtester/domain/entities/historical-round.entity';
import type { ConfigEvaluation } from '@backtester/domain/ports/optimizer.port';
import type { SimulatorPort } from '@backtester/domain/ports/simulator.port';
import type { BacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';
import type { ParameterBounds } from '@backtester/domain/value-objects/optimization-bounds.vo';
import { logDebug, logInfo } from '@backtester/infrastructure/logging/levelled-logger';
import type { ParameterGenerator } from '@backtester/infrastructure/adapters/optimizer/parameter-generator';

export interface HillClimbingParams {
  readonly initialBudgetSol: number;
  readonly bounds: ParameterBounds;
  readonly maxIterationsPerStart: number;
  readonly neighborsPerIteration: number;
  readonly convergenceThreshold: number;
}

export interface HillClimbingResult {
  readonly evaluations: readonly ConfigEvaluation[];
  readonly bestConfig: BacktestConfig;
  readonly bestROI: number;
  readonly totalIterations: number;
}

export class HillClimbingAdapter {
  constructor(
    private readonly simulator: SimulatorPort,
    private readonly generator: ParameterGenerator,
  ) {}

  async climb(
    data: readonly HistoricalRound[],
    startingConfig: BacktestConfig,
    params: HillClimbingParams,
    startIteration: number = 0,
  ): Promise<HillClimbingResult> {
    logInfo('\nHill Climbing: Starting from config with initial evaluation...');

    let currentConfig = startingConfig;
    const currentResult = await this.evaluateConfig(currentConfig, data, params.initialBudgetSol, startIteration);
    let currentROI = currentResult.metrics.roi;

    logDebug(`  Initial ROI: ${currentROI.toFixed(2)}%`);

    const allEvaluations: ConfigEvaluation[] = [currentResult];
    let iterationCount = 0;
    let stagnantIterations = 0;
    const maxStagnant = 3;

    while (iterationCount < params.maxIterationsPerStart && stagnantIterations < maxStagnant) {
      const neighbors = this.generateNeighbors(currentConfig, params.bounds, params.neighborsPerIteration);

      let bestNeighbor: ConfigEvaluation | null = null;
      let bestNeighborROI = currentROI;

      for (const neighbor of neighbors) {
        const evaluation = await this.evaluateConfig(
          neighbor,
          data,
          params.initialBudgetSol,
          startIteration + allEvaluations.length,
        );

        allEvaluations.push(evaluation);

        if (evaluation.metrics.roi > bestNeighborROI) {
          bestNeighbor = evaluation;
          bestNeighborROI = evaluation.metrics.roi;
        }
      }

      if (bestNeighbor !== null) {
        const improvement = bestNeighborROI - currentROI;

        if (improvement > params.convergenceThreshold) {
          currentConfig = bestNeighbor.config;
          currentROI = bestNeighborROI;
          stagnantIterations = 0;

          logDebug(
            `  Iteration ${iterationCount + 1}: Improved to ${currentROI.toFixed(2)}% (+${improvement.toFixed(2)}%)`,
          );
        } else {
          stagnantIterations++;
          logDebug(
            `  Iteration ${iterationCount + 1}: No significant improvement (${stagnantIterations}/${maxStagnant})`,
          );
        }
      } else {
        stagnantIterations++;
        logDebug(`  Iteration ${iterationCount + 1}: No better neighbor found (${stagnantIterations}/${maxStagnant})`);
      }

      iterationCount++;
    }

    if (stagnantIterations >= maxStagnant) {
      logInfo(`  Converged after ${iterationCount} iterations`);
    } else {
      logInfo(`  Reached max iterations (${params.maxIterationsPerStart})`);
    }

    logInfo(`  Final ROI: ${currentROI.toFixed(2)}%`);

    return {
      evaluations: allEvaluations,
      bestConfig: currentConfig,
      bestROI: currentROI,
      totalIterations: iterationCount,
    };
  }

  private generateNeighbors(config: BacktestConfig, bounds: ParameterBounds, count: number): BacktestConfig[] {
    const neighbors: BacktestConfig[] = [];

    for (let i = 0; i < count; i++) {
      neighbors.push(this.generator.generateNeighbor(config, bounds, 0.15));
    }

    return neighbors;
  }

  private async evaluateConfig(
    config: BacktestConfig,
    data: readonly HistoricalRound[],
    budgetSol: number,
    iteration: number,
  ): Promise<ConfigEvaluation> {
    const result = await this.simulator.simulateBatch(data, {
      config,
      initialBalanceLamports: this.solToLamports(budgetSol),
    });

    return {
      config,
      metrics: result.metrics,
      iteration,
    };
  }

  private solToLamports(sol: number): bigint {
    return BigInt(Math.floor(sol * 1_000_000_000));
  }
}
