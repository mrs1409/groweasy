// ============================================
// GrowEasy CSV Importer — Batch Processor Utility
// ============================================

import { logger } from './logger';

/**
 * Generic batch processor that chunks an array of items
 * and processes each batch sequentially.
 *
 * Sequential processing is chosen over parallel to:
 * - Respect LLM API rate limits (RPM/TPM)
 * - Ensure predictable processing order
 * - Simplify retry logic per batch
 *
 * @param items - Full array of items to process
 * @param batchSize - Number of items per batch
 * @param processor - Async function to process a single batch
 * @param onProgress - Optional callback after each batch completes
 * @returns Array of results from each batch
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[], batchIndex: number) => Promise<R>,
  onProgress?: (completedBatches: number, totalBatches: number, result: R) => void
): Promise<R[]> {
  // Chunk items into batches
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  const totalBatches = batches.length;
  const results: R[] = [];

  logger.info(`Starting batch processing`, {
    totalItems: items.length,
    batchSize,
    totalBatches,
  });

  // Process batches sequentially
  for (let i = 0; i < totalBatches; i++) {
    const batch = batches[i];

    logger.debug(`Processing batch ${i + 1}/${totalBatches}`, {
      batchIndex: i,
      batchSize: batch.length,
    });

    const startTime = Date.now();
    const result = await processor(batch, i);
    const elapsed = Date.now() - startTime;

    logger.debug(`Batch ${i + 1}/${totalBatches} completed in ${elapsed}ms`, {
      batchIndex: i,
      elapsedMs: elapsed,
    });

    results.push(result);

    if (onProgress) {
      onProgress(i + 1, totalBatches, result);
    }
  }

  logger.info(`Batch processing complete`, {
    totalBatches,
    resultsCount: results.length,
  });

  return results;
}
