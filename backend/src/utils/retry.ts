// ============================================
// GrowEasy CSV Importer — Retry Utility
// ============================================

import { RetryConfig } from '../types';
import { logger } from './logger';

/**
 * Default retry configuration.
 * - 3 retries with exponential backoff (1s → 2s → 4s)
 * - Random jitter (0–500ms) to prevent thundering herd
 * - Max delay capped at 10 seconds
 * - Only retries on 429 (rate limited) and 5xx (server errors)
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

/**
 * Determine if an error is retryable based on its properties.
 */
function isRetryableError(error: unknown, retryableStatuses: number[]): boolean {
  // Network errors are always retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up')
    ) {
      return true;
    }
  }

  // Check for HTTP status codes on the error object
  const statusError = error as { status?: number; statusCode?: number };
  const status = statusError.status || statusError.statusCode;
  if (status && retryableStatuses.includes(status)) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter.
 *
 * Formula: min(baseDelay * 2^attempt + jitter, maxDelay)
 *
 * Example with default config:
 *   Attempt 0: ~1000ms + jitter
 *   Attempt 1: ~2000ms + jitter
 *   Attempt 2: ~4000ms + jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 500; // 0–500ms random jitter
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Sleep for the specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an async function with automatic retry on failure.
 *
 * Uses exponential backoff with jitter. Only retries on
 * errors classified as retryable (network errors, 429, 5xx).
 * Non-retryable errors (400, 401, 403) fail immediately.
 *
 * @param fn - The async function to execute
 * @param operationName - Human-readable name for logging
 * @param customConfig - Optional override for retry configuration
 * @returns The result of the async function
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string,
  customConfig?: Partial<RetryConfig>
): Promise<T> {
  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...customConfig };
  const retryableStatuses = retryConfig.retryableStatuses || [];

  let lastError: unknown;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        logger.info(`${operationName} succeeded on attempt ${attempt + 1}`, {
          operation: operationName,
          attempt: attempt + 1,
        });
      }
      return result;
    } catch (error) {
      lastError = error;

      // Don't retry on the last attempt
      if (attempt === retryConfig.maxRetries) {
        logger.error(`${operationName} failed after ${attempt + 1} attempts — giving up`, {
          operation: operationName,
          totalAttempts: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }

      // Check if the error is retryable
      if (!isRetryableError(error, retryableStatuses)) {
        logger.error(`${operationName} failed with non-retryable error`, {
          operation: operationName,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error; // Fail fast for non-retryable errors
      }

      // Calculate delay and wait before retrying
      const delay = calculateDelay(attempt, retryConfig);
      logger.warn(`${operationName} failed on attempt ${attempt + 1} — retrying in ${Math.round(delay)}ms`, {
        operation: operationName,
        attempt: attempt + 1,
        nextRetryMs: Math.round(delay),
        error: error instanceof Error ? error.message : String(error),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}
