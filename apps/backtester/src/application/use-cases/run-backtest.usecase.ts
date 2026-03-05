import type { BacktestResult } from '@backtester/domain/aggregates/backtest-result.aggregate';
import { isRoundValid } from '@backtester/domain/entities/historical-round.entity';
import type { HistoricalDataPort } from '@backtester/domain/ports/historical-data.port';
import type { SimulatorPort } from '@backtester/domain/ports/simulator.port';
import type { BacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';
import type { SimulationParams } from '@backtester/domain/value-objects/simulation-params.vo';
import { logDebug, logInfo } from '@backtester/infrastructure/logging/levelled-logger';

export interface RunBacktestInput {
  readonly config: BacktestConfig;
  readonly params: SimulationParams;
}

export class RunBacktestUseCase {
  constructor(
    private readonly historicalData: HistoricalDataPort,
    private readonly simulator: SimulatorPort,
  ) {}

  async execute(input: RunBacktestInput): Promise<BacktestResult> {
    logInfo('Loading historical rounds...');

    const query = {
      count: input.params.roundCount ?? undefined,
      startRoundId: input.params.startRoundId ?? undefined,
      endRoundId: input.params.endRoundId ?? undefined,
    };

    const allRounds = await this.historicalData.getRounds(query);

    logDebug(`Loaded ${allRounds.length} rounds from database`);

    const validRounds = allRounds.filter(isRoundValid);

    if (validRounds.length < allRounds.length) {
      const skipped = allRounds.length - validRounds.length;
      logDebug(`Filtered out ${skipped} invalid rounds`);
    }

    if (validRounds.length === 0) {
      throw new Error('No valid rounds to backtest');
    }

    logInfo(`Starting backtest simulation with ${validRounds.length} rounds...`);

    const result = await this.simulator.simulateBatch(validRounds, {
      config: input.config,
      initialBalanceLamports: input.params.initialBalanceLamports,
    });

    logInfo('Backtest complete!');

    return result;
  }

  async getDatasetInfo(): Promise<{
    totalRounds: number;
    oldestRoundId: bigint;
    latestRoundId: bigint;
  }> {
    const [totalRounds, oldestRoundId, latestRoundId] = await Promise.all([
      this.historicalData.getRoundCount(),
      this.historicalData.getOldestRoundId(),
      this.historicalData.getLatestRoundId(),
    ]);

    return {
      totalRounds,
      oldestRoundId,
      latestRoundId,
    };
  }
}
