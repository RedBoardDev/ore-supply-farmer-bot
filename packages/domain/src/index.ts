/** biome-ignore-all assist/source/organizeImports: brroken feature */
// Aggregates
export type { Board, BoardProps } from "./aggregates/board.aggregate";
export type { Miner, MinerProps } from "./aggregates/miner.aggregate";
export type { Round, RoundProps } from "./aggregates/round.aggregate";

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

// Infrastructure
export type { LoggerPort, LogLevel } from "./infrastructure/logger.port";
export { createPinoLogger, PinoLogger, createChildLogger } from "./infrastructure/pino-logger";

// Ports (Interfaces)
export type { BlockchainPort } from './ports/blockchain.port';
export type { NotificationMessage, NotificationPort } from './ports/notification.port';
export type { PricePort, PriceQuote } from './ports/price.port';
export type { StoragePort } from './ports/storage.port';
export type { ClockPort } from './ports/clock.port';

// Value Objects
export { LAMPORTS_PER_SOL, Lamports } from "./value-objects/lamports.vo";
export { ORE_FEES, OrePrice } from "./value-objects/ore-price.vo";
export { RoundId } from "./value-objects/round-id.vo";
export { SLOTS_PER_SECOND, Slot } from "./value-objects/slot.vo";
export { StakeAmount } from "./value-objects/stake-amount.vo";

// Services
export type { EvStrategyService, EvStrategyConfig, PlacementDecision } from './services/ev-strategy.service';
export { DefaultEvStrategyService } from './services/default-ev-strategy.service';
export type { CheckpointService } from './services/checkpoint.service';
export { DefaultCheckpointService } from './services/default-checkpoint.service';
export type { LatencyRecord, LatencySnapshot, LatencyService, LatencyStoragePort } from './services/latency.service';
export { DefaultLatencyService, FileLatencyStorage } from './services/latency.service';
export type { MiningCostStrategy, MiningCostConfig, MiningDecision, MiningCostResult, MiningCostInput } from './services/mining-cost-strategy.service';
export { DefaultMiningCostStrategy } from './services/mining-cost-strategy.service';
export { DefaultClock } from './services/default-clock';
