import type { HistoricalRound } from '@backtester/domain/entities/historical-round.entity';
import type { ConfigEvaluation } from '@backtester/domain/ports/optimizer.port';
import type { SimulatorPort } from '@backtester/domain/ports/simulator.port';
import type { BacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';
import type { ParameterBounds } from '@backtester/domain/value-objects/optimization-bounds.vo';
import { logDebug, logInfo } from '@backtester/infrastructure/logging/levelled-logger';
import type { ParameterGenerator } from '@backtester/infrastructure/adapters/optimizer/parameter-generator';

export interface RandomSearchParams {
  readonly initialBudgetSol: number;
  readonly bounds: ParameterBounds;
  readonly numConfigs: number;
  readonly subSampleSize: number | null;
}

export interface RandomSearchResult {
  readonly evaluations: readonly ConfigEvaluation[];
  readonly bestConfig: BacktestConfig;
  readonly bestROI: number;
}

export class RandomSearchAdapter {
  constructor(
    private readonly simulator: SimulatorPort,
    private readonly generator: ParameterGenerator,
  ) {}

  async search(
    data: readonly HistoricalRound[],
    params: RandomSearchParams,
    baseConfig: BacktestConfig,
  ): Promise<RandomSearchResult> {
    logInfo(`\nRandom Search: Generating ${params.numConfigs} random configurations...`);

    const configs = this.generateConfigs(params.numConfigs, params.bounds, baseConfig);

    const sampleData = this.selectSample(data, params.subSampleSize);
    logInfo(`Evaluating on ${sampleData.length} rounds...`);

    const evaluations: ConfigEvaluation[] = [];

    for (let i = 0; i < configs.length; i++) {
      if (i % 10 === 0 && i > 0) {
        logDebug(`  Evaluated ${i}/${configs.length} configs...`);
      }

      const result = await this.simulator.simulateBatch(sampleData, {
        config: configs[i],
        initialBalanceLamports: this.solToLamports(params.initialBudgetSol),
      });

      evaluations.push({
        config: configs[i],
        metrics: result.metrics,
        iteration: i,
      });
    }

    logInfo(`Random Search complete: ${evaluations.length} configs evaluated`);

    const sorted = [...evaluations].sort((a, b) => b.metrics.roi - a.metrics.roi);
    const best = sorted[0];

    logInfo(`Best ROI from random search: ${best.metrics.roi.toFixed(2)}%`);

    return {
      evaluations,
      bestConfig: best.config,
      bestROI: best.metrics.roi,
    };
  }

  getTopN(evaluations: readonly ConfigEvaluation[], n: number): readonly ConfigEvaluation[] {
    return [...evaluations].sort((a, b) => b.metrics.roi - a.metrics.roi).slice(0, n);
  }

  private generateConfigs(count: number, bounds: ParameterBounds, baseConfig: BacktestConfig): BacktestConfig[] {
    const configs: BacktestConfig[] = [];

    for (let i = 0; i < count; i++) {
      configs.push(this.generator.generateRandomConfig(bounds, baseConfig));
    }

    return configs;
  }

  private selectSample(data: readonly HistoricalRound[], sampleSize: number | null): readonly HistoricalRound[] {
    if (sampleSize === null || sampleSize >= data.length) {
      return data;
    }

    const step = Math.floor(data.length / sampleSize);
    const sample: HistoricalRound[] = [];

    for (let i = 0; i < sampleSize; i++) {
      const index = i * step;
      if (index < data.length) {
        sample.push(data[index]);
      }
    }

    return sample;
  }

  private solToLamports(sol: number): bigint {
    return BigInt(Math.floor(sol * 1_000_000_000));
  }
}
