/**
 * لاگر ساخت‌یافتهٔ Worker — پیاده‌سازی لاگر
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Structured logger — خروجی JSON، بدون PII (قانون ۹)
// مسئولیت پرهیز از PII با فراخواننده است؛ این ماژول فقط scope و سطح را اضافه می‌کند.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(subScope: string): Logger;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): LogLevel {
  const env = (globalThis as { ENV?: string }).ENV ?? 'development';
  return env === 'production' ? 'info' : 'debug';
}

function emit(scope: string, level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel()]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(meta ? { meta } : {})
  };
  console.log(JSON.stringify(entry));
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, meta) => emit(scope, 'debug', msg, meta),
    info: (msg, meta) => emit(scope, 'info', msg, meta),
    warn: (msg, meta) => emit(scope, 'warn', msg, meta),
    error: (msg, meta) => emit(scope, 'error', msg, meta),
    child: (subScope: string) => createLogger(`${scope}.${subScope}`)
  };
}
