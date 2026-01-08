import { PublicKey } from '@solana/web3.js';

export interface BoardAccount {
  roundId: bigint;
  startSlot: bigint;
  endSlot: bigint;
  epochId: bigint;
}

export interface RoundAccount {
  id: bigint;
  deployed: bigint[];
  counts: bigint[];
  slotHash: Buffer;
  expiresAt: bigint;
  motherlode: bigint;
  rentPayer: PublicKey;
  topMiner: PublicKey;
  topMinerReward: bigint;
  totalDeployed: bigint;
  totalMiners: bigint;
  totalVaulted: bigint;
  totalWinnings: bigint;
}

export interface MinerAccount {
  authority: PublicKey;
  deployed: bigint[];
  rewardsSol: bigint;
  rewardsOre: bigint;
  refinedOre: bigint;
  checkpointFee: bigint;
  checkpointId: bigint;
  roundId: bigint;
}

const ACCOUNT_DISCRIMINATOR_SIZE = 8;
const U64_SIZE = 8;
const PUBKEY_SIZE = 32;

function readU64LE(buffer: Buffer, offset: number): bigint {
  return buffer.readBigUInt64LE(offset);
}

export function decodeBoardAccount(data: Buffer): BoardAccount {
  let offset = ACCOUNT_DISCRIMINATOR_SIZE;
  const roundId = readU64LE(data, offset);
  offset += U64_SIZE;
  const startSlot = readU64LE(data, offset);
  offset += U64_SIZE;
  const endSlot = readU64LE(data, offset);
  offset += U64_SIZE;
  const epochId = readU64LE(data, offset);
  return { roundId, startSlot, endSlot, epochId };
}

export function decodeRoundAccount(data: Buffer): RoundAccount {
  let offset = ACCOUNT_DISCRIMINATOR_SIZE;
  const id = readU64LE(data, offset);
  offset += U64_SIZE;

  const deployed: bigint[] = [];
  for (let i = 0; i < 25; i += 1) {
    deployed.push(readU64LE(data, offset));
    offset += U64_SIZE;
  }

  const slotHash = data.slice(offset, offset + 32);
  offset += 32;

  const counts: bigint[] = [];
  for (let i = 0; i < 25; i += 1) {
    counts.push(readU64LE(data, offset));
    offset += U64_SIZE;
  }

  const expiresAt = readU64LE(data, offset);
  offset += U64_SIZE;
  const motherlode = readU64LE(data, offset);
  offset += U64_SIZE;

  const rentPayer = new PublicKey(data.slice(offset, offset + PUBKEY_SIZE));
  offset += PUBKEY_SIZE;

  const topMiner = new PublicKey(data.slice(offset, offset + PUBKEY_SIZE));
  offset += PUBKEY_SIZE;

  const topMinerReward = readU64LE(data, offset);
  offset += U64_SIZE;

  const totalDeployed = readU64LE(data, offset);
  offset += U64_SIZE;

  const totalMiners = readU64LE(data, offset);
  offset += U64_SIZE;

  const totalVaulted = readU64LE(data, offset);
  offset += U64_SIZE;

  const totalWinnings = readU64LE(data, offset);

  return {
    id,
    deployed,
    counts,
    slotHash,
    expiresAt,
    motherlode,
    rentPayer,
    topMiner,
    topMinerReward,
    totalDeployed,
    totalMiners,
    totalVaulted,
    totalWinnings
  };
}

export function decodeMinerAccount(data: Buffer): MinerAccount {
  let offset = ACCOUNT_DISCRIMINATOR_SIZE;
  const authority = new PublicKey(data.slice(offset, offset + PUBKEY_SIZE));
  offset += PUBKEY_SIZE;

  const deployed: bigint[] = [];
  for (let i = 0; i < 25; i += 1) {
    deployed.push(readU64LE(data, offset));
    offset += U64_SIZE;
  }

  const rewardsSol = readU64LE(data, offset);
  offset += U64_SIZE;

  const rewardsOre = readU64LE(data, offset);
  offset += U64_SIZE;

  const refinedOre = readU64LE(data, offset);
  offset += U64_SIZE;

  const checkpointFee = readU64LE(data, offset);
  offset += U64_SIZE;

  const checkpointId = readU64LE(data, offset);
  offset += U64_SIZE;

  const roundId = readU64LE(data, offset);

  return {
    authority,
    deployed,
    rewardsSol,
    rewardsOre,
    refinedOre,
    checkpointFee,
    checkpointId,
    roundId
  };
}
