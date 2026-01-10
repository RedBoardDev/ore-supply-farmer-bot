import type { Board } from '@osb/domain/aggregates/board.aggregate';
import type { Miner, SolanaAddress } from '@osb/domain/aggregates/miner.aggregate';
import type { Round } from '@osb/domain/aggregates/round.aggregate';
import type { RoundId } from '@osb/domain/value-objects/round-id.vo';

export interface BlockchainPort {
  // Account fetching
  getBoard(): Promise<Board | null>;
  getRound(roundId: RoundId): Promise<Round | null>;
  getMiner(authority: SolanaAddress): Promise<Miner | null>;
  getBalance(publicKey: SolanaAddress): Promise<bigint>;

  // Subscriptions
  onBoardChange(callback: (board: Board) => void): Promise<number>;
  onSlotChange(callback: (slot: bigint) => void): Promise<number>;
  unsubscribeBoard(subscriptionId: number): Promise<void>;
  unsubscribeSlot(subscriptionId: number): Promise<void>;

  // Blockhash
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
}
