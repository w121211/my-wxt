// src/lib/utils/logger.ts
// Simple logger implementation

import type { Logger } from '../automators/types';

export function createLogger(prefix: string): Logger {
  return {
    debug(message: string, meta?: Record<string, unknown>): void {
      console.debug(`[${prefix}]`, message, meta || '');
    },
    info(message: string, meta?: Record<string, unknown>): void {
      console.info(`[${prefix}]`, message, meta || '');
    },
    warn(message: string, meta?: Record<string, unknown>): void {
      console.warn(`[${prefix}]`, message, meta || '');
    },
    error(message: string, meta?: Record<string, unknown>): void {
      console.error(`[${prefix}]`, message, meta || '');
    },
  };
}
