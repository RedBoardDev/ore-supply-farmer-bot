import { isRoundValid } from '@backtester/domain/entities/historical-round.entity';
import type { HistoricalDataPort } from '@backtester/domain/ports/historical-data.port';
import type { OptimizationParams, OptimizationResult, ConfigEvaluation } from '@backtester/domain/ports/optimizer.port';
import type { SimulatorPort } from '@backtester/domain/ports/simulator.port';
import type { BacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';
import { HillClimbingAdapter } from '@backtester/infrastructure/adapters/optimizer/hill-climbing.adapter';
import { ParameterGenerator } from '@backtester/infrastructure/adapters/optimizer/parameter-generator';
import { RandomSearchAdapter } from '@backtester/infrastructure/adapters/optimizer/random-search.adapter';
import { logDebug, logInfo } from '@backtester/infrastructure/logging/levelled-logger';

export interface RunOptimizationInput {
  readonly params: OptimizationParams;
  readonly baseConfig: BacktestConfig;
  readonly roundCount: number | null;
}

export class RunOptimizationUseCase {
  constructor(
    private readonly historicalData: HistoricalDataPort,
    private readonly simulator: SimulatorPort,
  ) {}

  async execute(input: RunOptimizationInput): Promise<OptimizationResult> {
    const startTime = Date.now();

    logInfo('Loading historical rounds for optimization...');
    const allRounds = await this.historicalData.getRounds({
      count: input.roundCount ?? undefined,
    });

    logDebug(`Loaded ${allRounds.length} rounds from database`);

    const validRounds = allRounds.filter(isRoundValid);

    if (validRounds.length < allRounds.length) {
      const skipped = allRounds.length - validRounds.length;
      logDebug(`Filtered out ${skipped} invalid rounds`);
    }

    if (validRounds.length === 0) {
      throw new Error('No valid rounds to optimize on');
    }

    logInfo(`Starting optimization with ${validRounds.length} rounds...`);
    logInfo('');

    const generator = new ParameterGenerator();
    const randomSearch = new RandomSearchAdapter(this.simulator, generator);
    const hillClimbing = new HillClimbingAdapter(this.simulator, generator);

    logInfo('=== PHASE 1: RANDOM SEARCH (Exploration) ===');
    const numRandomConfigs = Math.min(50, input.params.maxIterations);

    const randomSearchResult = await randomSearch.search(
      validRounds,
      {
        initialBudgetSol: input.params.initialBudgetSol,
        bounds: input.params.bounds,
        numConfigs: numRandomConfigs,
        subSampleSize: input.params.subSampleSize,
      },
      input.baseConfig,
    );

    const topCandidates = randomSearch.getTopN(randomSearchResult.evaluations, 5);
    if (topCandidates.length === 0) {
      throw new Error('Random search produced no candidate to optimize from');
    }
    logDebug('\nTop 5 candidates from random search:');
    topCandidates.forEach((c, i) => {
      logDebug(`  ${i + 1}. ROI: ${c.metrics.roi.toFixed(2)}% | Win Rate: ${(c.metrics.winRate * 100).toFixed(2)}%`);
    });

    logInfo('\n=== PHASE 2: HILL CLIMBING (Exploitation) ===');

    const allEvaluations: ConfigEvaluation[] = [...randomSearchResult.evaluations];
    const firstCandidate = topCandidates[0];
    if (!firstCandidate) {
      throw new Error('Missing first random-search candidate');
    }

    let globalBestConfig = firstCandidate.config;
    let globalBestROI = firstCandidate.metrics.roi;
    const convergenceHistory: number[] = [globalBestROI];

    for (let i = 0; i < Math.min(3, topCandidates.length); i++) {
      logInfo(`\nHill Climbing from candidate ${i + 1}/${topCandidates.length}...`);

      const candidate = topCandidates[i];
      if (!candidate) {
        continue;
      }

      const climbResult = await hillClimbing.climb(
        validRounds,
        candidate.config,
        {
          initialBudgetSol: input.params.initialBudgetSol,
          bounds: input.params.bounds,
          maxIterationsPerStart: 10,
          neighborsPerIteration: 8,
          convergenceThreshold: input.params.convergenceThreshold,
        },
        allEvaluations.length,
      );

      allEvaluations.push(...climbResult.evaluations);

      if (climbResult.bestROI > globalBestROI) {
        const improvement = climbResult.bestROI - globalBestROI;
        logInfo(`  New global best! ROI improved by +${improvement.toFixed(2)}%`);
        globalBestConfig = climbResult.bestConfig;
        globalBestROI = climbResult.bestROI;
        convergenceHistory.push(globalBestROI);
      }
    }

    const elapsedMs = Date.now() - startTime;

    logInfo('\n=== OPTIMIZATION COMPLETE ===');
    logInfo(`Total evaluations: ${allEvaluations.length}`);
    logInfo(`Best ROI achieved: ${globalBestROI.toFixed(2)}%`);
    logInfo(`Time elapsed: ${(elapsedMs / 1000).toFixed(1)}s`);

    const bestEvaluation = allEvaluations.find((e) => e.config === globalBestConfig);

    if (!bestEvaluation) {
      throw new Error('Failed to find best evaluation');
    }

    return {
      bestConfig: globalBestConfig,
      bestMetrics: bestEvaluation.metrics,
      iterations: allEvaluations.length,
      allResults: allEvaluations,
      convergenceHistory,
      elapsedMs,
    };
  }
}
