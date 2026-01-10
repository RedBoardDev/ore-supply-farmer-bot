import type { Board } from '@osb/domain/aggregates/board.aggregate';
import type { Miner } from '@osb/domain/aggregates/miner.aggregate';
import type { Round } from '@osb/domain/aggregates/round.aggregate';
import type { OrePrice } from '@osb/domain/value-objects/ore-price.vo';

export interface EvStrategyConfig {
  baseStakePercent: number;
  minEvRatio: number | null;
  capNormalLamports: bigint;
  capHighEvLamports: bigint;
  maxPlacementsPerRound: number;
  maxExposureLamportsPerRound: bigint | null;
  balanceBufferLamports: bigint;
  minStakeLamports: bigint;
  scanSquareCount: number;
  includeOreInEv: boolean;
  stakeScalingFactor: number;
  volumeDecayPercentPerPlacement: number;
}

export interface PlacementDecision {
  squareIndex: number;
  amountLamports: bigint;
  evRatio: number;
  othersStakeLamports: bigint;
}

export interface EvStrategyServicePort {
  calculateDecisions(
    board: Board | null,
    round: Round,
    miner: Miner,
    solPerOre: number,
    netSolPerOre: number,
    walletBalanceLamports: bigint,
  ): PlacementDecision[];
  recalculateEv(params: {
    squareIndex: number;
    stakeLamports: bigint;
    round: Round;
    miner: Miner;
    orePrice: OrePrice | null;
    executedExposureLamports: bigint;
  }): { evRatio: number; othersStakeLamports: bigint } | null;
  getLastBestEvRatio(): number | null;
}
