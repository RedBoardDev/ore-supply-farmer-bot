import type { LogLevel as BotLogLevel } from '@osb/bot/infrastructure/logging/logger.port';
import { createPinoLogger } from '@osb/bot/infrastructure/logging/pino-logger';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

let currentLogLevel: LogLevel = 'warn';

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
  createPinoLogger({
    name: 'osb-backtester',
    logLevel: mapToBotLogLevel(level),
  });
}

export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLogLevel];
}

export function logDebug(message: string): void {
  if (shouldLog('debug')) {
    console.debug(message);
  }
}

export function logInfo(message: string): void {
  if (shouldLog('info')) {
    console.log(message);
  }
}

export function logWarn(message: string): void {
  if (shouldLog('warn')) {
    console.warn(message);
  }
}

export function logError(message: string): void {
  if (shouldLog('error')) {
    console.error(message);
  }
}

function mapToBotLogLevel(level: LogLevel): BotLogLevel {
  switch (level) {
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    case 'silent':
      return 'fatal';
  }
}
