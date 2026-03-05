import { z } from 'zod';

const lamportsSchema = z.union([z.bigint(), z.number(), z.string()]).transform((value, ctx) => {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      ctx.addIssue({ code: 'custom', message: 'Lamports must be non-negative' });
      return z.NEVER;
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || !Number.isInteger(value) || value < 0) {
      ctx.addIssue({ code: 'custom', message: 'Lamports must be a non-negative safe integer' });
      return z.NEVER;
    }
    return BigInt(value);
  }

  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    ctx.addIssue({ code: 'custom', message: 'Lamports must be a numeric string' });
    return z.NEVER;
  }
  const parsed = BigInt(trimmed);
  if (parsed < 0n) {
    ctx.addIssue({ code: 'custom', message: 'Lamports must be non-negative' });
    return z.NEVER;
  }
  return parsed;
});

const nullableLamportsSchema = z.union([lamportsSchema, z.null()]);

export const backtestConfigSchema = z
  .object({
    baseStakePercent: z.number().min(0).max(1),
    minStakeLamports: lamportsSchema,
    capNormalLamports: lamportsSchema,
    capHighEvLamports: lamportsSchema,
    minEvRatio: z.number().min(0).nullable(),
    maxPlacementsPerRound: z.number().int().min(1).max(25),
    maxExposureLamportsPerRound: nullableLamportsSchema,
    balanceBufferLamports: lamportsSchema,
    scanSquareCount: z.number().int().min(1).max(25),
    includeOreInEv: z.boolean(),
    stakeScalingFactor: z.number().min(0).max(10),
    volumeDecayPercentPerPlacement: z.number().min(0).max(100),
  })
  .superRefine((config, ctx) => {
    if (config.capHighEvLamports < config.capNormalLamports) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'capHighEvLamports must be greater than or equal to capNormalLamports',
        path: ['capHighEvLamports'],
      });
    }

    if (config.minStakeLamports > config.capNormalLamports) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'minStakeLamports must be less than or equal to capNormalLamports',
        path: ['minStakeLamports'],
      });
    }
  });

export type BacktestConfig = z.infer<typeof backtestConfigSchema>;

export function parseBacktestConfig(data: unknown): BacktestConfig {
  return backtestConfigSchema.parse(data);
}

export function createDefaultConfig(): BacktestConfig {
  return {
    baseStakePercent: 0.015,
    minStakeLamports: 1_000_000n,
    capNormalLamports: 500_000_000n,
    capHighEvLamports: 1_000_000_000n,
    minEvRatio: 1.0,
    maxPlacementsPerRound: 12,
    maxExposureLamportsPerRound: null,
    balanceBufferLamports: 100_000_000n,
    scanSquareCount: 25,
    includeOreInEv: true,
    stakeScalingFactor: 2.0,
    volumeDecayPercentPerPlacement: 0,
  };
}
