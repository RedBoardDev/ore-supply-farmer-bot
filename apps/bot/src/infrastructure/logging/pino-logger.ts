import { loadConfig } from '@osb/config';
import pino, { type Logger, type LoggerOptions } from 'pino';
import type { LoggerPort, LogLevel } from './logger.port.js';

export interface LoggerConfig {
  level: LogLevel;
  name: string;
  prettyPrint?: boolean;
  traceErrors?: boolean;
}

export class PinoLogger implements LoggerPort {
  private logger: Logger;
  private name: string;
  private traceErrors: boolean;

  constructor(config: LoggerConfig, existingLogger?: Logger) {
    this.name = config.name;
    this.traceErrors = config.traceErrors ?? false;

    if (existingLogger) {
      this.logger = existingLogger;
      return;
    }

    const options: LoggerOptions = {
      name: config.name,
      level: config.level,
    };

    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };

    this.logger = pino(options);
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.logger.trace(context, message);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(context, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context, message);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    const logContext = error
      ? {
          ...context,
          err: this.traceErrors ? { message: error.message, stack: error.stack } : { message: error.message },
        }
      : context;
    this.logger.error(logContext, message);
  }

  fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    const logContext = error
      ? {
          ...context,
          err: this.traceErrors ? { message: error.message, stack: error.stack } : { message: error.message },
        }
      : context;
    this.logger.fatal(logContext, message);
  }

  child(bindings: Record<string, unknown>): LoggerPort {
    const childLogger = this.logger.child(bindings);
    return new PinoLogger({ name: this.name, level: 'info', traceErrors: this.traceErrors }, childLogger);
  }

  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  getLevel(): LogLevel {
    return this.logger.level as LogLevel;
  }
}

let globalRootLogger: LoggerPort | null = null;

export function createPinoLogger(config: { name: string; logLevel?: LogLevel; traceErrors?: boolean }): void {
  const level = (config.logLevel ?? 'warn') as LogLevel;

  globalRootLogger = new PinoLogger({
    name: config.name,
    level,
    traceErrors: config.traceErrors,
  });
}

function initializeRootLogger(): void {
  try {
    const { config } = loadConfig();
    createPinoLogger({
      name: 'osb',
      logLevel: config.telemetry.logLevel,
      traceErrors: config.telemetry.traceErrors,
    });
  } catch {
    createPinoLogger({ name: 'osb' });
  }
}

export function createChildLogger(name: string): LoggerPort {
  if (!globalRootLogger) {
    initializeRootLogger();
  }
  if (!globalRootLogger) {
    throw new Error('Logger not initialized');
  }
  return globalRootLogger.child({ name });
}
