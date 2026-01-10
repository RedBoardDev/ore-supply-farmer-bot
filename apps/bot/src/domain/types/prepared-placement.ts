import type { PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { TransactionInstruction } from '@solana/web3.js';

export interface PreparedPlacement {
  decision: PlacementDecision;
  instructions: TransactionInstruction[];
}
