import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ConfigSchema } from '@osb/config';
import { loadConfig, loadEnv } from '@osb/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function buildConfigFile(): Omit<ConfigSchema, 'rpc' | 'telemetry'> & {
  rpc: { commitment: 'processed' | 'confirmed' | 'finalized' };
  telemetry: { logLevel: 'debug' | 'info' | 'warn' | 'error'; traceErrors: boolean };
} {
  return {
    fastMode: true,
    telemetry: { logLevel: 'warn', traceErrors: false },
    rpc: { commitment: 'processed' },
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
      minStakeLamports: 1_000_000,
      capNormalLamports: 500_000_000,
      capHighEvLamports: 1_000_000_000,
      minEvRatio: 1.0,
      maxPlacementsPerRound: 12,
      maxExposureLamportsPerRound: null,
      balanceBufferLamports: 100_000_000,
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
}

describe('config loader', () => {
  let tempDir: string;
  let configPath: string;
  let envPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osb-config-'));
    configPath = path.join(tempDir, 'config.json');
    envPath = path.join(tempDir, '.env');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('merges env into config (rpc + telemetry)', () => {
    const configFile = buildConfigFile();
    fs.writeFileSync(configPath, JSON.stringify(configFile, null, 2));

    fs.writeFileSync(
      envPath,
      [
        'WALLET_KEYPAIR=BOT_KEYPAIR',
        'RPC_HTTP_ENDPOINT=http://localhost:8899',
        'RPC_WS_ENDPOINT=ws://localhost:8900',
        'DISCORD_WEBHOOK_URL=https://discord.example/webhook',
        'JUPITER_API_KEY=test-key',
      ].join('\n'),
    );

    const { config, env } = loadConfig({ configPath, envPath });

    expect(env.RPC_HTTP_ENDPOINT).toBe('http://localhost:8899');
    expect(config.rpc.httpEndpoint).toBe('http://localhost:8899');
    expect(config.rpc.wsEndpoint).toBe('ws://localhost:8900');
    expect(config.telemetry.discordWebhookUrl).toBe('https://discord.example/webhook');
  });

  it('throws when env variables are missing', () => {
    const configFile = buildConfigFile();
    fs.writeFileSync(configPath, JSON.stringify(configFile, null, 2));
    fs.writeFileSync(envPath, 'RPC_HTTP_ENDPOINT=http://localhost:8899');

    expect(() => loadEnv({ envPath })).toThrow(/\.env validation failed/);
  });
});
