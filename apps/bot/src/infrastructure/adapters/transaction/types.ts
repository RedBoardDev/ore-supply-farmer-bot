import type { PublicKey } from '@solana/web3.js';

export enum OreInstruction {
  Automate = 0,
  Checkpoint = 2,
  ClaimSol = 3,
  Deploy = 6,
}

export interface CheckpointParams {
  authority: PublicKey;
  roundId: bigint;
}

export interface DeployParams {
  executor: PublicKey;
  authority: PublicKey;
  roundId: bigint;
  amountLamports: bigint;
  targetSquares: number[];
  entropyVar?: PublicKey;
}

export interface ClaimSolParams {
  authority: PublicKey;
}

export interface ConfigAccount {
  varAddress: PublicKey;
}

export interface SendResult {
  signature: string;
  confirmed: boolean;
  error?: string;
}

export interface SendOptions {
  useCachedBlockhash?: boolean;
  blockhashContext?: { blockhash: string; lastValidBlockHeight: number };
  confirmationCommitment?: 'confirmed' | 'processed' | 'finalized';
  awaitConfirmation?: boolean;
  awaitProcessed?: boolean;
}
