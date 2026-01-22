import { PublicKey } from '@solana/web3.js';

export const ORE_TOKEN_ADDRESS = new PublicKey('oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp');
export const SOL_TOKEN_ADDRESS = new PublicKey('So11111111111111111111111111111111111111112');

export const ORE_PROGRAM_ID = new PublicKey('oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv');
export const ENTROPY_PROGRAM_ID = new PublicKey('3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X');

const BOARD_SEED = Buffer.from('board');

export function deriveBoardPda(): PublicKey {
  return PublicKey.findProgramAddressSync([BOARD_SEED], ORE_PROGRAM_ID)[0];
}

export const BOARD_ADDRESS = deriveBoardPda();

export function deriveRoundPda(roundId: bigint): PublicKey {
  const idBuffer = Buffer.alloc(8);
  idBuffer.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync([Buffer.from('round'), idBuffer], ORE_PROGRAM_ID)[0];
}

export function deriveMinerPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('miner'), authority.toBuffer()], ORE_PROGRAM_ID)[0];
}

export function deriveConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('config')], ORE_PROGRAM_ID)[0];
}

export const SLOT_DURATION_MS = 400;
export const MIN_LOOP_SLEEP_MS = 150;
export const MAX_LOOP_SLEEP_MS = 2000;
export const STREAM_FRESHNESS_LIMIT_MS = 150;
export const INSTRUCTION_CACHE_LIMIT = 64;
export const ORE_BOARD_SIZE = 25;
export const ORE_ATOMS_PER_ORE = 100_000_000_000n;
