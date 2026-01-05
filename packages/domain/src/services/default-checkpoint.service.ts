import type { Miner } from '../aggregates/miner.aggregate';
import type { SolanaAddress } from '../ports/blockchain.port';
import type { RoundId } from '../value-objects/round-id.vo';
import type { CheckpointService } from './checkpoint.service';

export class DefaultCheckpointService implements CheckpointService {
  private lastCheckpointedRound: bigint | null = null;
  private inflight = new Map<bigint, Promise<boolean>>();

  /**
   * Notify that a new round has started.
   * Clears the inflight checkpoint map for the new round.
   */
  notifyRoundStart(_roundId: bigint): void {
    // Clear inflight checkpoints from previous round
    this.inflight.clear();
  }

  /**
   * Determines if checkpoint is needed for the current round.
   */
  needsCheckpoint(miner: Miner, currentRoundId: RoundId): boolean {
    return miner.checkpointId < currentRoundId.value;
  }

  /**
   * Ensures miner is checkpointed to the current round.
   * Returns true if checkpoint was submitted or was already done.
   */
  async ensureCheckpoint(
    miner: Miner,
    _currentRoundId: RoundId,
    authorityAddress: SolanaAddress,
    submitFn: (instructionData: Uint8Array) => Promise<{ signature: string }>
  ): Promise<boolean> {
    const targetRound = miner.roundId;

    // If miner round is 0, already initialized
    if (targetRound === 0n) {
      this.lastCheckpointedRound = targetRound;
      return true;
    }

    // If already checkpointed to this round
    if (miner.checkpointId === targetRound) {
      this.lastCheckpointedRound = targetRound;
      return true;
    }

    // If we already submitted checkpoint for this round
    if (this.lastCheckpointedRound === targetRound) {
      return true;
    }

    // Check for inflight checkpoint request
    const existing = this.inflight.get(targetRound);
    if (existing) {
      await existing;
      return true;
    }

    // Submit checkpoint
    const promise = this.submitCheckpoint(targetRound, authorityAddress, submitFn)
      .then((success) => {
        if (success) {
          this.lastCheckpointedRound = targetRound;
        }
        return success;
      })
      .finally(() => {
        this.inflight.delete(targetRound);
      });

    this.inflight.set(targetRound, promise);
    return promise;
  }

  private async submitCheckpoint(
    _roundId: bigint,
    _authorityAddress: SolanaAddress,
    submitFn: (instructionData: Uint8Array) => Promise<{ signature: string }>
  ): Promise<boolean> {
    try {
      // Checkpoint instruction is just the opcode (2)
      const instructionData = new Uint8Array([2]);
      const result = await submitFn(instructionData);
      return !!result.signature;
    } catch {
      return false;
    }
  }
}
