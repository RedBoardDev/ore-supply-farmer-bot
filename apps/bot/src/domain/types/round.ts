import type { PriceQuote } from '@osb/bot/domain/services/ports/price.port.d';
import type { BudgetInfo } from './budget-info';
import type { PreparedPlacement } from './prepared-placement';

export interface SimpleRoundMetrics {
  totalStakeLamports: bigint;
  squares: Set<number>;
  evaluated: boolean;
  placements: number;
}

export interface RoundMetrics extends SimpleRoundMetrics {
  priceQuote: PriceQuote | null;
}

export interface RoundStreamContext {
  roundId: bigint;
  miner: any;
  walletBalanceLamports: bigint;
  priceQuote: PriceQuote;
  maxPlacements: number;
}

export interface QueuedPlacement {
  placement: PreparedPlacement;
  budget: BudgetInfo;
}

export interface RoundState {
  placedRoundId: bigint | null;
  priceRefreshedForRound: bigint | null;
  checkpointTriggeredForRound: bigint | null;
  roundEndLoggedForRound: bigint | null;
  autoTriggerLoggedForRound: bigint | null;
}
