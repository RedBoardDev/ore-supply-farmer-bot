import { z } from 'zod';

export interface ParameterBounds {
  readonly minEvRatio: readonly [number, number];
  readonly baseStakePercent: readonly [number, number];
  readonly stakeScalingFactor: readonly [number, number];
  readonly maxPlacementsPerRound: readonly [number, number];
  readonly capNormalLamports: readonly [bigint, bigint];
  readonly capHighEvLamports: readonly [bigint, bigint];
  readonly balanceBufferLamports: readonly [bigint, bigint];
  readonly volumeDecayPercent: readonly [number, number];
}

export const optimizationBoundsSchema = z.object({
  minEvRatio: z.tuple([z.number().min(0), z.number().min(0)]),
  baseStakePercent: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  stakeScalingFactor: z.tuple([z.number().min(0), z.number().min(0)]),
  maxPlacementsPerRound: z.tuple([z.number().int().min(1), z.number().int().max(25)]),
  capNormalLamports: z.tuple([z.bigint().min(0n), z.bigint().min(0n)]),
  capHighEvLamports: z.tuple([z.bigint().min(0n), z.bigint().min(0n)]),
  balanceBufferLamports: z.tuple([z.bigint().min(0n), z.bigint().min(0n)]),
  volumeDecayPercent: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
});

export function createDefaultBounds(): ParameterBounds {
  return {
    minEvRatio: [0.8, 2.0],
    baseStakePercent: [0.005, 0.05],
    stakeScalingFactor: [1.0, 5.0],
    maxPlacementsPerRound: [1, 12],
    capNormalLamports: [100_000_000n, 1_000_000_000n],
    capHighEvLamports: [500_000_000n, 2_000_000_000n],
    balanceBufferLamports: [50_000_000n, 500_000_000n],
    volumeDecayPercent: [0, 10],
  };
}

export function validateBounds(bounds: ParameterBounds): void {
  if (bounds.minEvRatio[0] >= bounds.minEvRatio[1]) {
    throw new Error('minEvRatio: lower bound must be less than upper bound');
  }
  if (bounds.baseStakePercent[0] >= bounds.baseStakePercent[1]) {
    throw new Error('baseStakePercent: lower bound must be less than upper bound');
  }
  if (bounds.stakeScalingFactor[0] >= bounds.stakeScalingFactor[1]) {
    throw new Error('stakeScalingFactor: lower bound must be less than upper bound');
  }
  if (bounds.maxPlacementsPerRound[0] >= bounds.maxPlacementsPerRound[1]) {
    throw new Error('maxPlacementsPerRound: lower bound must be less than upper bound');
  }
  if (bounds.capNormalLamports[0] >= bounds.capNormalLamports[1]) {
    throw new Error('capNormalLamports: lower bound must be less than upper bound');
  }
  if (bounds.capHighEvLamports[0] >= bounds.capHighEvLamports[1]) {
    throw new Error('capHighEvLamports: lower bound must be less than upper bound');
  }
  if (bounds.balanceBufferLamports[0] >= bounds.balanceBufferLamports[1]) {
    throw new Error('balanceBufferLamports: lower bound must be less than upper bound');
  }
  if (bounds.volumeDecayPercent[0] >= bounds.volumeDecayPercent[1]) {
    throw new Error('volumeDecayPercent: lower bound must be less than upper bound');
  }
}
