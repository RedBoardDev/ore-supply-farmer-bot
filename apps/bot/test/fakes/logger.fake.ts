import type { LoggerPort, LogLevel } from '@osb/bot/infrastructure/logging/logger.port';

export class FakeLogger implements LoggerPort {
  private level: LogLevel = 'info';

  trace(_message: string): void {}
  debug(_message: string): void {}
  info(_message: string): void {}
  warn(_message: string): void {}
  error(_message: string): void {}
  fatal(_message: string): void {}

  child(_bindings: Record<string, unknown>): LoggerPort {
    return this;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }
}
