import { PublicKey } from '@solana/web3.js';

export const ORE_PROGRAM_ID = new PublicKey('oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv');
export const ORE_TOKEN_ADDRESS = new PublicKey('oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp');
export const SOL_TOKEN_ADDRESS = new PublicKey('So11111111111111111111111111111111111111112');
export const ENTROPY_PROGRAM_ID = new PublicKey('3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X');
export const BOARD_ADDRESS = new PublicKey('oreoR6mC2vG9BYaDMPE5VvLdYZ7W1dVVNLdcX1zCwTpu');

export function deriveRoundPda(roundId: bigint): PublicKey {
  const idBuffer = Buffer.alloc(8);
  idBuffer.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('round'), idBuffer],
    ORE_PROGRAM_ID
  )[0];
}

export function deriveMinerPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('miner'), authority.toBuffer()],
    ORE_PROGRAM_ID
  )[0];
}

export function deriveConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    ORE_PROGRAM_ID
  )[0];
}

export const SLOT_DURATION_MS = 400;
export const MIN_LOOP_SLEEP_MS = 150;
export const MAX_LOOP_SLEEP_MS = 2000;
export const STREAM_FRESHNESS_LIMIT_MS = 150;
export const INSTRUCTION_CACHE_LIMIT = 64;
