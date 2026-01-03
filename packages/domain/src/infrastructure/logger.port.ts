export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerPort {
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, context?: Record<string, unknown>): void;

  child(bindings: Record<string, unknown>): LoggerPort;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}
