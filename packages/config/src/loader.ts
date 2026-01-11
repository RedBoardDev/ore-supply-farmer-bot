import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ZodIssue } from 'zod';
import { type ConfigFileSchema, type ConfigSchema, configFileSchema, configSchema } from './config';
import { type EnvSchema, envSchema } from './env';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config/config.json');
const DEFAULT_ENV_PATH = path.resolve(process.cwd(), 'config/.env');

export interface LoadOptions {
  configPath?: string;
  envPath?: string;
  skipEnv?: boolean;
}

export interface LoadedConfig {
  config: ConfigSchema;
  env: EnvSchema;
}

interface LoadEnvOptions {
  envPath?: string;
  skipEnv?: boolean;
}

export function loadConfig(options: LoadOptions = {}): LoadedConfig {
  const { configPath = DEFAULT_CONFIG_PATH, envPath = DEFAULT_ENV_PATH, skipEnv = false } = options;

  const configFile = loadConfigFile(configPath);
  const env = loadEnv({ envPath, skipEnv });

  const mergedConfig = mergeConfig(configFile, env);
  const result = configSchema.safeParse(mergedConfig);

  if (!result.success) {
    throw new Error(`Configuration validation failed:\n${formatZodIssues(result.error.issues)}`);
  }

  return {
    config: result.data,
    env,
  };
}

export function loadConfigFile(configPath: string = DEFAULT_CONFIG_PATH): ConfigFileSchema {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const rawConfig = JSON.parse(configContent);
  const result = configFileSchema.safeParse(rawConfig);

  if (!result.success) {
    throw new Error(`Configuration file validation failed:\n${formatZodIssues(result.error.issues)}`);
  }

  return result.data;
}

export function loadEnv(options: LoadEnvOptions = {}): EnvSchema {
  const { envPath = DEFAULT_ENV_PATH, skipEnv = false } = options;
  const fileVars = skipEnv ? {} : readEnvFile(envPath);
  const processVars = readProcessEnv(Object.keys(envSchema.shape));
  const mergedEnv = { ...fileVars, ...processVars };

  const result = envSchema.safeParse(mergedEnv);

  if (!result.success) {
    throw new Error(`.env validation failed:\n${formatZodIssues(result.error.issues)}`);
  }

  return result.data;
}

function readEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  return parseEnvContent(content);
}

function parseEnvContent(content: string): Record<string, string> {
  const envVars: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    envVars[key] = value;
  }

  return envVars;
}

function readProcessEnv(keys: string[]): Record<string, string> {
  const envVars: Record<string, string> = {};

  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string') {
      envVars[key] = value;
    }
  }

  return envVars;
}

function mergeConfig(configFile: ConfigFileSchema, env: EnvSchema): ConfigSchema {
  return {
    ...configFile,
    rpc: {
      ...configFile.rpc,
      httpEndpoint: env.RPC_HTTP_ENDPOINT,
      wsEndpoint: env.RPC_WS_ENDPOINT,
    },
    telemetry: {
      ...configFile.telemetry,
      discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
    },
  };
}

function formatZodIssues(issues: ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      return `  - ${path}: ${issue.message}`;
    })
    .join('\n');
}

export function validateConfig(config: unknown): config is ConfigSchema {
  const result = configSchema.safeParse(config);
  return result.success;
}

export function validateEnv(env: unknown): env is EnvSchema {
  const result = envSchema.safeParse(env);
  return result.success;
}
