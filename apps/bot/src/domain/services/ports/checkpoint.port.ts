import type { Miner, SolanaAddress } from '@osb/domain/aggregates/miner.aggregate';
import type { RoundId } from '@osb/domain/value-objects/round-id.vo';

export interface CheckpointServicePort {
  /**
   * Notify that a new round has started.
   * Allows the service to reset its internal state and prepare for the new round.
   */
  notifyRoundStart(roundId: bigint): void;

  /**
   * Determines if checkpoint is needed for the current round.
   */
  needsCheckpoint(miner: Miner, currentRoundId: RoundId): boolean;

  /**
   * Ensures miner is checkpointed to the current round.
   * Returns true if checkpoint was submitted or was already done.
   */
  ensureCheckpoint(
    miner: Miner,
    currentRoundId: RoundId,
    authorityAddress: SolanaAddress,
    submitFn: (instructionData: Uint8Array) => Promise<{ signature: string }>,
  ): Promise<boolean>;
}
