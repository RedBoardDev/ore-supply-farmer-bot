import { EvStrategyService } from '@osb/bot/domain/services/ev-strategy.service';
import type { EvStrategyConfig, PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import { Miner } from '@osb/domain/aggregates/miner.aggregate';
import { Round } from '@osb/domain/aggregates/round.aggregate';
import { RoundId } from '@osb/domain/value-objects/round-id.vo';
import type { HistoricalRound } from '@backtester/domain/entities/historical-round.entity';
import type { SimulatedPlacement } from '@backtester/domain/entities/simulated-round.entity';
import type { BacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';
import { logWarn } from '@backtester/infrastructure/logging/levelled-logger';

export class EvSimulatorService {
  private readonly evStrategy: EvStrategyService;

  constructor(config: BacktestConfig) {
    const evConfig: EvStrategyConfig = this.convertToEvStrategyConfig(config);
    this.evStrategy = new EvStrategyService(evConfig);
  }

  simulatePlacements(round: HistoricalRound, walletBalanceLamports: bigint): readonly SimulatedPlacement[] {
    try {
      const roundAggregate = this.createRoundFromHistorical(round);
      const minerAggregate = this.createFreshMiner(round.roundId);

      const solPerOre = round.orePriceUsd / round.solPriceUsd;
      const netSolPerOre = solPerOre * 0.9;

      const decisions: PlacementDecision[] = this.evStrategy.calculateDecisions(
        null,
        roundAggregate,
        minerAggregate,
        solPerOre,
        netSolPerOre,
        walletBalanceLamports,
      );

      return decisions.map((d) => ({
        squareIndex: d.squareIndex,
        amountLamports: d.amountLamports,
        evRatio: d.evRatio,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn(`Failed to simulate placements for round ${round.roundId}: ${message}`);
      return [];
    }
  }

  private createRoundFromHistorical(historical: HistoricalRound): Round {
    return Round.create(
      RoundId.create(historical.roundId),
      historical.deployed,
      historical.motherlode,
      historical.expiresAt,
    );
  }

  private createFreshMiner(roundId: bigint): Miner {
    const emptyDeployed = Array(25).fill(0n);

    return Miner.create('simulated-authority', emptyDeployed, 0n, 0n, roundId, roundId);
  }

  private convertToEvStrategyConfig(config: BacktestConfig): EvStrategyConfig {
    return {
      baseStakePercent: config.baseStakePercent,
      minStakeLamports: config.minStakeLamports,
      capNormalLamports: config.capNormalLamports,
      capHighEvLamports: config.capHighEvLamports,
      minEvRatio: config.minEvRatio,
      maxPlacementsPerRound: config.maxPlacementsPerRound,
      maxExposureLamportsPerRound: config.maxExposureLamportsPerRound,
      balanceBufferLamports: config.balanceBufferLamports,
      scanSquareCount: config.scanSquareCount,
      includeOreInEv: config.includeOreInEv,
      stakeScalingFactor: config.stakeScalingFactor,
      volumeDecayPercentPerPlacement: config.volumeDecayPercentPerPlacement,
    };
  }
}
