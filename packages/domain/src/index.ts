/** biome-ignore-all assist/source/organizeImports: brroken feature */
// Aggregates
export { Board, type BoardProps } from "./aggregates/board.aggregate";
export { Miner, type MinerProps } from "./aggregates/miner.aggregate";
export { Round, type RoundProps } from "./aggregates/round.aggregate";

// Domain Events
export type { RoundStartedEventData } from './events/round-started.event';
export { roundStartedEvent } from './events/round-started.event';
export type { RoundEndedEventData } from './events/round-ended.event';
export { roundEndedEvent } from './events/round-ended.event';
export type { PlacementExecutedEventData } from './events/placement-executed.event';
export { placementExecutedEvent } from './events/placement-executed.event';
export type { CheckpointCompletedEventData } from './events/checkpoint-completed.event';
export { checkpointCompletedEvent } from './events/checkpoint-completed.event';
export type { RewardsClaimedEventData } from './events/rewards-claimed.event';
export { rewardsClaimedEvent } from './events/rewards-claimed.event';

// Value Objects
export { Lamports } from "./value-objects/lamports.vo";
export { ORE_FEES, OrePrice } from "./value-objects/ore-price.vo";
export { RoundId } from "./value-objects/round-id.vo";
export { SLOTS_PER_SECOND, Slot } from "./value-objects/slot.vo";
export { StakeAmount } from "./value-objects/stake-amount.vo";
