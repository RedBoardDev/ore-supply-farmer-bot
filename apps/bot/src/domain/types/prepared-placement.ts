import type { PlacementDecision } from '@osb/domain';
import type { TransactionInstruction } from '@solana/web3.js';

export interface PreparedPlacement {
  decision: PlacementDecision;
  instructions: TransactionInstruction[];
}
