import pino, { type Logger, type LoggerOptions } from 'pino';
import type { LoggerPort, LogLevel } from './logger.port.js';

export interface LoggerConfig {
  level: LogLevel;
  name: string;
  containerId?: string;
  prettyPrint?: boolean;
}

export class PinoLogger implements LoggerPort {
  private logger: Logger;
  private name: string;

  constructor(config: LoggerConfig, existingLogger?: Logger) {
    this.name = config.name;

    if (existingLogger) {
      this.logger = existingLogger;
      return;
    }

    const options: LoggerOptions = {
      name: config.name,
      level: config.level,
    };

    if (config.containerId) {
      options.base = { containerId: config.containerId };
    }

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
      ? { ...context, err: { message: error.message, stack: error.stack } }
      : context;
    this.logger.error(logContext, message);
  }

  fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    const logContext = error
      ? { ...context, err: { message: error.message, stack: error.stack } }
      : context;
    this.logger.fatal(logContext, message);
  }

  child(bindings: Record<string, unknown>): LoggerPort {
    const childLogger = this.logger.child(bindings);
    return new PinoLogger({ name: this.name, level: 'info' }, childLogger);
  }

  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  getLevel(): LogLevel {
    return this.logger.level as LogLevel;
  }
}

export function createPinoLogger(config?: Partial<LoggerConfig>): LoggerPort {
  const level = ((process.env.LOG_LEVEL ?? 'info') as LogLevel);
  const containerId = process.env.CONTAINER_ID;
  const prettyPrint = process.env.NODE_ENV !== 'production';

  const fullConfig: LoggerConfig = {
    level,
    name: 'ore-smart-bot',
    containerId,
    prettyPrint,
    ...config,
  };

  return new PinoLogger(fullConfig);
}
