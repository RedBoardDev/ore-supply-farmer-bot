import type { ConfigSchema } from '@osb/config';

export function buildConfig(overrides: Partial<ConfigSchema> = {}): ConfigSchema {
  const base: ConfigSchema = {
    fastMode: true,
    telemetry: {
      logLevel: 'warn',
      traceErrors: false,
      discordWebhookUrl: undefined,
    },
    rpc: {
      commitment: 'processed',
      httpEndpoint: 'http://localhost:8899',
      wsEndpoint: 'ws://localhost:8900',
    },
    timing: {
      minSlots: 1,
      maxSlots: 5,
      safetySlots: 1,
      overheadMs: 10,
      parallelismFactor: 1.5,
      prepSlotsAhead: 3,
      latencyMetricsPath: 'data/latency-history.ndjson',
      latencyHistorySize: 100,
      latencyService: {
        slotDurationMs: 400,
        smoothing: 0.2,
        initialPrepMs: 400,
        initialExecPerPlacementMs: 160,
        maxSamples: 200,
      },
      boardPollIntervalMs: 5000,
      queueOverheadMaxMs: 30,
      queueOverheadFactor: 8,
    },
    strategy: {
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
      stakeDecayPercent: 0,
    },
    transaction: {
      priorityFeeMicrolamports: 150_000,
      computeUnitLimit: 220_000,
      skipPreflight: true,
      awaitProcessed: false,
      awaitConfirmation: false,
      confirmationMode: 'processed',
      maxRetriesMain: 5,
      maxRetriesDefault: 3,
    },
    claim: {
      thresholdSol: 0,
    },
    miningCost: {
      enabled: false,
      thresholdPercent: 5,
      historyRounds: 10,
    },
  };

  return {
    ...base,
    ...overrides,
    telemetry: {
      ...base.telemetry,
      ...(overrides.telemetry ?? {}),
    },
    rpc: {
      ...base.rpc,
      ...(overrides.rpc ?? {}),
    },
    timing: {
      ...base.timing,
      ...(overrides.timing ?? {}),
      latencyService: {
        ...base.timing.latencyService,
        ...(overrides.timing?.latencyService ?? {}),
      },
    },
    strategy: {
      ...base.strategy,
      ...(overrides.strategy ?? {}),
    },
    transaction: {
      ...base.transaction,
      ...(overrides.transaction ?? {}),
    },
    claim: {
      ...base.claim,
      ...(overrides.claim ?? {}),
    },
    miningCost: {
      ...base.miningCost,
      ...(overrides.miningCost ?? {}),
    },
  };
}
