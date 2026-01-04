import { z } from 'zod';

export const telemetrySchema = z.object({
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('warn'),
  traceErrors: z.boolean().default(false),
  discordWebhookUrl: z.url().optional(),
});

export type TelemetryConfig = z.infer<typeof telemetrySchema>;

export const rpcSchema = z.object({
  httpEndpoint: z.url(),
  wsEndpoint: z.url(),
  commitment: z.enum(['processed', 'confirmed', 'finalized']).default('processed'),
});

export type RpcConfig = z.infer<typeof rpcSchema>;

export const runtimeSchema = z.object({
  // dryRun: z.boolean().default(true),
  autoMinSlots: z.number().int().min(1).max(50).default(1),
  autoMaxSlots: z.number().int().min(1).max(50).default(5),
  autoSafetySlots: z.number().int().min(0).max(10).default(1),
  overheadPerPlacementMs: z.number().int().min(0).max(200).default(10),
  parallelismFactor: z.number().min(1).max(5).default(1.5),
  prepSlotsAhead: z.number().int().min(0).max(20).default(3),
  latencyMetricsPath: z.string().min(1).default('data/latency-history.ndjson'),
  latencyHistorySize: z.number().int().min(10).max(100_000).default(100),
});

export type RuntimeConfig = z.infer<typeof runtimeSchema>;

export const miningCostSchema = z.object({
  enabled: z.boolean().default(false),
  thresholdPercent: z.number().min(-1000).max(1000).default(5),
  historyRounds: z.number().int().min(2).max(500).default(10),
});

export type MiningCostConfig = z.infer<typeof miningCostSchema>;

export const strategySchema = z.object({
  baseStakePercent: z.number().min(0).max(1).default(0.015),
  minStakeLamports: z.union([z.bigint(), z.string()]).transform(val => typeof val === 'string' ? BigInt(val) : val),
  capNormalLamports: z.union([z.bigint(), z.string()]).transform(val => typeof val === 'string' ? BigInt(val) : val),
  capHighEvLamports: z.union([z.bigint(), z.string()]).transform(val => typeof val === 'string' ? BigInt(val) : val),
  minEvRatio: z.number().min(0).nullable().default(1.0),
  maxPlacementsPerRound: z.number().int().min(1).max(25).default(12),
  maxExposureLamportsPerRound: z.union([z.bigint(), z.string(), z.null()]).transform(val => val === null ? null : typeof val === 'string' ? BigInt(val) : val),
  balanceBufferLamports: z.union([z.bigint(), z.string()]).transform(val => typeof val === 'string' ? BigInt(val) : val),
  scanSquareCount: z.number().int().min(1).max(25).default(25),
  includeOreInEv: z.boolean().default(true),
  stakeScalingFactor: z.number().min(0).max(10).default(2.0),
  volumeDecayPercentPerPlacement: z.number().min(0).max(10).default(0),
  miningCost: miningCostSchema,
});

export type StrategyConfig = z.infer<typeof strategySchema>;

export const transactionSchema = z.object({
  priorityFeeMicrolamports: z.number().int().min(0).max(1_000_000).default(150_000),
  computeUnitLimit: z.number().int().min(50_000).max(1_400_000).default(220_000),
  skipPreflight: z.boolean().default(true),
  confirmationCommitment: z.enum(['processed', 'confirmed', 'finalized']).default('processed'),
  awaitConfirmation: z.boolean().default(false),
  awaitProcessed: z.boolean().default(false),
});

export type TransactionConfig = z.infer<typeof transactionSchema>;

export const claimSchema = z.object({
  thresholdSol: z.number().min(0).default(0),
});

export type ClaimConfig = z.infer<typeof claimSchema>;

export const placementSchema = z.object({
  amountLamports: z.number().int().min(1).default(1_000_000),
  squareCount: z.number().int().min(1).max(100).default(25),
});

export type PlacementConfig = z.infer<typeof placementSchema>;

export const configSchema = z.object({
  telemetry: telemetrySchema,
  rpc: rpcSchema,
  runtime: runtimeSchema,
  strategy: strategySchema,
  transaction: transactionSchema,
  claim: claimSchema,
  placement: placementSchema,
});

export type ConfigSchema = z.infer<typeof configSchema>;
