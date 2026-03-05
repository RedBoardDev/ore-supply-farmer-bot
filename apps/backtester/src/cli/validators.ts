import fs from 'node:fs';
import { LOG_LEVELS, type LogLevel } from '@backtester/infrastructure/logging/levelled-logger';

export function validateConfigFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function validateRoundsParameter(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error('Rounds must be a positive integer');
  }

  return parsed;
}

export function validateRoundIdParameter(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error('Round ID must be a valid integer');
  }
}

export function validateBalanceParameter(value: string): number {
  const parsed = Number.parseFloat(value);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error('Balance must be a positive number');
  }

  return parsed;
}

export function validateBudgetParameter(value: string): number {
  const parsed = Number.parseFloat(value);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error('Budget must be a positive number');
  }

  return parsed;
}

export function validateEvRatioParameter(value: string): number {
  const parsed = Number.parseFloat(value);

  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error('EV ratio must be a non-negative number');
  }

  return parsed;
}

export function validateIterationsParameter(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 10_000) {
    throw new Error('Iterations must be between 1 and 10000');
  }

  return parsed;
}

export function validateLogLevelParameter(value: string | undefined): LogLevel {
  const normalized = (value ?? 'warn').toLowerCase();

  if (!isLogLevel(normalized)) {
    throw new Error(`Log level must be one of: ${LOG_LEVELS.join(', ')}`);
  }

  return normalized;
}

function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.includes(value as LogLevel);
}
