// ============================================
// GrowEasy CSV Importer — Structured Logger
// ============================================

/**
 * Lightweight structured logger for production observability.
 * Outputs JSON in production for log aggregation tools,
 * and human-readable format in development.
 *
 * No external dependencies — keeps the bundle lean.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private minLevel: LogLevel;

  constructor() {
    const envLevel = process.env['LOG_LEVEL'] as LogLevel | undefined;
    this.minLevel = envLevel && envLevel in LOG_LEVEL_PRIORITY
      ? envLevel
      : (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private formatEntry(entry: LogEntry): string {
    if (process.env['NODE_ENV'] === 'production') {
      return JSON.stringify(entry);
    }

    // Human-readable development format
    const { timestamp, level, message, ...extra } = entry;
    const prefix = `[${timestamp}] ${level.toUpperCase().padEnd(5)}`;
    const extraStr = Object.keys(extra).length > 0
      ? ` ${JSON.stringify(extra)}`
      : '';
    return `${prefix} ${message}${extraStr}`;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };

    const formatted = this.formatEntry(entry);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }
}

/**
 * Singleton logger instance used throughout the application.
 */
export const logger = new Logger();
