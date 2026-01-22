import { z } from 'zod';

// ============================================================================
// Helpers
// ============================================================================

const optionalUrlSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().url().optional());

const lamportsSchema = z.union([z.bigint(), z.number(), z.string()]).transform((value, ctx) => {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      ctx.addIssue({ code: 'custom', message: 'Lamports must be a non-negative integer' });
      return z.NEVER;
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || !Number.isInteger(value)) {
      ctx.addIssue({ code: 'custom', message: 'Lamports must be a safe integer' });
      return z.NEVER;
    }
    if (value < 0) {
      ctx.addIssue({ code: 'custom', message: 'Lamports must be a non-negative integer' });
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
    ctx.addIssue({ code: 'custom', message: 'Lamports must be a non-negative integer' });
    return z.NEVER;
  }
  return parsed;
});

const nullableLamportsSchema = z.union([lamportsSchema, z.null()]);

// ============================================================================
// CONFIG SCHEMA (config.json)
// ============================================================================

const telemetryFileSchema = z
  .object({
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('warn'),
    traceErrors: z.boolean().default(false),
  })
  .strict();

export const telemetrySchema = telemetryFileSchema.extend({
  discordWebhookUrl: optionalUrlSchema,
});

export type TelemetryConfig = z.infer<typeof telemetrySchema>;

const rpcFileSchema = z
  .object({
    commitment: z.enum(['processed', 'confirmed', 'finalized']).default('processed'),
  })
  .strict();

export const rpcSchema = rpcFileSchema.extend({
  httpEndpoint: z.string().trim().url(),
  wsEndpoint: z.string().trim().url(),
});

export type RpcConfig = z.infer<typeof rpcSchema>;

export const timingSchema = z
  .object({
    minSlots: z.number().int().min(1).max(50).default(1),
    maxSlots: z.number().int().min(1).max(50).default(5),
    safetySlots: z.number().int().min(0).max(10).default(1),
    overheadMs: z.number().int().min(0).max(200).default(10),
    parallelismFactor: z.number().min(1).max(5).default(1.5),
    prepSlotsAhead: z.number().int().min(0).max(20).default(3),
    latencyMetricsPath: z.string().min(1).default('data/latency-history.ndjson'),
    latencyHistorySize: z.number().int().min(10).max(100_000).default(100),
    latencyService: z
      .object({
        slotDurationMs: z.number().int().min(100).max(1000).default(400),
        smoothing: z.number().min(0).max(1).default(0.2),
        initialPrepMs: z.number().int().min(0).max(5000).default(400),
        initialExecPerPlacementMs: z.number().int().min(0).max(5000).default(160),
        maxSamples: z.number().int().min(10).max(10_000).default(200),
      })
      .default({
        slotDurationMs: 400,
        smoothing: 0.2,
        initialPrepMs: 400,
        initialExecPerPlacementMs: 160,
        maxSamples: 200,
      }),
    boardPollIntervalMs: z.number().int().min(500).max(60_000).default(5_000),
    queueOverheadMaxMs: z.number().int().min(0).max(500).default(30),
    queueOverheadFactor: z.number().int().min(0).max(50).default(8),
  })
  .strict();

export type TimingConfig = z.infer<typeof timingSchema>;

export const strategySchema = z
  .object({
    baseStakePercent: z.number().min(0).max(1).default(0.015),
    minStakeLamports: lamportsSchema,
    capNormalLamports: lamportsSchema,
    capHighEvLamports: lamportsSchema,
    minEvRatio: z.number().min(0).nullable().default(1.0),
    maxPlacementsPerRound: z.number().int().min(1).max(25).default(12),
    maxExposureLamportsPerRound: nullableLamportsSchema,
    balanceBufferLamports: lamportsSchema,
    scanSquareCount: z.number().int().min(1).max(25).default(25),
    includeOreInEv: z.boolean().default(true),
    stakeScalingFactor: z.number().min(0).max(10).default(2.0),
    stakeDecayPercent: z.number().min(0).max(10).default(0),
  })
  .strict();

export type StrategyConfig = z.infer<typeof strategySchema>;

export const transactionSchema = z
  .object({
    priorityFeeMicrolamports: z.number().int().min(0).max(1_000_000).default(150_000),
    computeUnitLimit: z.number().int().min(50_000).max(1_400_000).default(220_000),
    skipPreflight: z.boolean().default(true),
    awaitProcessed: z.boolean().default(false),
    awaitConfirmation: z.boolean().default(false),
    confirmationMode: z.enum(['processed', 'confirmed', 'finalized']).default('processed'),
    maxRetriesMain: z.number().int().min(0).max(20).default(5),
    maxRetriesDefault: z.number().int().min(0).max(20).default(3),
  })
  .strict();

export type TransactionConfig = z.infer<typeof transactionSchema>;

export const claimSchema = z
  .object({
    thresholdSol: z.union([z.number().min(0), z.literal(false)]).default(0),
  })
  .strict();

export type ClaimConfig = z.infer<typeof claimSchema>;

export const miningCostSchema = z
  .object({
    enabled: z.boolean().default(false),
    thresholdPercent: z.number().min(-1000).max(1000).default(5),
    historyRounds: z.number().int().min(2).max(500).default(10),
  })
  .strict();

export type MiningCostConfig = z.infer<typeof miningCostSchema>;

// ============================================================================
// MAIN CONFIG SCHEMAS
// ============================================================================

export const configFileSchema = z
  .object({
    $schema: z.string().optional(),
    $comment: z.string().optional(),
    fastMode: z.boolean().default(true),
    telemetry: telemetryFileSchema,
    rpc: rpcFileSchema,
    timing: timingSchema,
    strategy: strategySchema,
    transaction: transactionSchema,
    claim: claimSchema,
    miningCost: miningCostSchema,
  })
  .strict();

export type ConfigFileSchema = z.infer<typeof configFileSchema>;

export const configSchema = configFileSchema
  .extend({
    telemetry: telemetrySchema,
    rpc: rpcSchema,
  })
  .strict();

export type ConfigSchema = z.infer<typeof configSchema>;
