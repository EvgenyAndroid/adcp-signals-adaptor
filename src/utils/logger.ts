// src/utils/logger.ts
// Structured logging - outputs JSON lines for observability pipelines

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  event: string;
  ts: string;
  requestId?: string;
  [key: string]: unknown;
}

export class Logger {
  private requestId?: string;

  constructor(requestId?: string) {
    this.requestId = requestId;
  }

  private write(level: LogLevel, event: string, meta: Record<string, unknown> = {}): void {
    const entry: LogEntry = {
      level,
      event,
      ts: new Date().toISOString(),
      ...(this.requestId ? { requestId: this.requestId } : {}),
      ...meta,
    };
    // In Workers, console.log goes to wrangler tail / logpush
    console.log(JSON.stringify(entry));
  }

  debug(event: string, meta?: Record<string, unknown>): void {
    this.write("debug", event, meta);
  }

  info(event: string, meta?: Record<string, unknown>): void {
    this.write("info", event, meta);
  }

  warn(event: string, meta?: Record<string, unknown>): void {
    this.write("warn", event, meta);
  }

  error(event: string, meta?: Record<string, unknown>): void {
    this.write("error", event, meta);
  }
}

export function createLogger(requestId?: string): Logger {
  return new Logger(requestId);
}
