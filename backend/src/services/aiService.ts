// ============================================
// GrowEasy CSV Importer — AI Service
// ============================================
//
// Orchestrates the complete AI extraction pipeline:
//
//  CSV Records → Batch → Prompt → LLM → Parse →
//  Repair → Validate → Hallucination Check → Merge
//
// DESIGN DECISIONS:
//
// 1. SINGLE SYSTEM PROMPT: The system prompt is built
//    once and reused across all batches. This saves
//    tokens and ensures consistent behavior.
//
// 2. SEQUENTIAL BATCHING: Batches are processed one at
//    a time (not parallel) to respect LLM rate limits.
//    At 20 records per batch and ~5s per batch, 100
//    records take ~25s — acceptable for a user flow
//    that starts with an explicit "Confirm" click.
//
// 3. PARTIAL SUCCESS: If 4 of 5 batches succeed and 1
//    fails, we return the 80% that worked + flag the
//    20% as skipped. Total failure ≠ partial failure.
//
// 4. RETRY AT BATCH LEVEL: We retry entire batches,
//    not individual records. This keeps prompts
//    consistent and avoids context fragmentation.
//
// 5. TWO-PASS PARSING: Direct parse → repair service.
//    Most responses parse directly (fast path). The
//    repair service handles edge cases without the
//    cost of another LLM call.
//
// 6. HALLUCINATION CROSS-CHECK: We pass original source
//    records to the validator so it can verify extracted
//    emails/phones actually exist in the source data.
//
// ============================================

import { GoogleGenerativeAI, GenerateContentResult } from '@google/generative-ai';
import OpenAI from 'openai';
import {
  CRMRecord,
  SkippedRecord,
  RawCSVRecord,
  BatchResult,
  AppError,
} from '../types';
import { config } from '../config';
import { ERROR_CODES } from '../constants';
import { buildSystemPrompt, buildUserPrompt } from '../prompts/extractionPrompt';
import { parseAIResponse, validateBatchResponse } from './validationService';
import { processBatches } from '../utils/batchProcessor';
import { withRetry } from '../utils/retry';
import { logger } from '../utils/logger';
import { extractRowHeuristically } from '../utils/fallbackExtractor';

// Initialize AI clients lazily based on provider
const genAI = config.aiProvider === 'gemini' ? new GoogleGenerativeAI(config.geminiApiKey) : null;
const openai = config.aiProvider === 'openai' ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

/**
 * Result of the full AI extraction pipeline.
 */
export interface AIExtractionResult {
  records: CRMRecord[];
  skipped: SkippedRecord[];
  batchesProcessed: number;
  totalBatches: number;
  failedBatches: number;
  processingTimeMs: number;
}



/**
 * Extract CRM records from raw CSV data using AI.
 *
 * This is the main entry point for the AI pipeline.
 *
 * Pipeline stages:
 * 1. Build system prompt (once for all batches)
 * 2. Chunk records into batches of configurable size
 * 3. For each batch:
 *    a. Build user prompt with CSV headers + batch data
 *    b. Call LLM API with retry (exponential backoff)
 *    c. Parse response (direct parse → repair service)
 *    d. Validate + sanitize (enum enforcement, dates, etc.)
 *    e. Check for hallucinations (cross-reference with source)
 * 4. Merge all batch results
 * 5. Calculate statistics
 *
 * @param headers - CSV column names (sent with every batch for context)
 * @param records - All raw parsed CSV records
 * @returns Complete extraction result with records, skipped, and stats
 */
export async function extractCRMRecords(
  headers: string[],
  records: RawCSVRecord[],
  onBatchComplete?: (completedBatches: number, totalBatches: number, processedRows: number) => void
): Promise<AIExtractionResult> {
  const startTime = Date.now();
  const totalBatches = Math.ceil(records.length / config.batchSize);

  logger.info('Starting AI extraction pipeline', {
    headerCount: headers.length,
    headers: headers,
    recordCount: records.length,
    batchSize: config.batchSize,
    totalBatches,
    model: config.aiProvider === 'openai' ? config.openaiModel : config.geminiModel,
    provider: config.aiProvider,
    maxRetries: config.maxRetries,
  });

  // Build the system prompt ONCE (shared across all batches)
  // This contains all business rules, few-shot examples,
  // and output schema — it doesn't change per batch.
  const systemPrompt = buildSystemPrompt();

  logger.debug('System prompt built', {
    promptLength: systemPrompt.length,
    estimatedTokens: Math.ceil(systemPrompt.length / 4), // rough char→token estimate
  });

  // Process all records in sequential batches
  const batchResults = await processBatches<RawCSVRecord, BatchResult>(
    records,
    config.batchSize,
    async (batch: RawCSVRecord[], batchIndex: number) => {
      return processOneBatch(
        systemPrompt,
        headers,
        batch,
        batchIndex,
        totalBatches,
        batchIndex * config.batchSize // global row offset for correct indexing
      );
    },
    (completed, total, result) => {
      const status = result.success ? '✅' : '❌';
      logger.info(`${status} Batch ${completed}/${total} complete`, {
        batchIndex: result.batchIndex,
        success: result.success,
        records: result.records.length,
        skipped: result.skipped.length,
      });

      if (onBatchComplete) {
        const processedRows = completed * config.batchSize;
        onBatchComplete(completed, total, Math.min(processedRows, records.length));
      }
    }
  );

  // ─── Merge Results ─────────────────────────────
  const allRecords: CRMRecord[] = [];
  const allSkipped: SkippedRecord[] = [];
  let successfulBatches = 0;
  let failedBatchCount = 0;

  for (const result of batchResults) {
    if (result.success) {
      allRecords.push(...result.records);
      allSkipped.push(...result.skipped);
      successfulBatches++;
    } else {
      failedBatchCount++;
      // Failed batch records are already in result.skipped
      // (created in processOneBatch's catch block)
      allSkipped.push(...result.skipped);
      logger.error(`Batch ${result.batchIndex} failed permanently`, {
        batchIndex: result.batchIndex,
        error: result.error,
        skippedRecords: result.skipped.length,
      });
    }
  }

  const processingTimeMs = Date.now() - startTime;

  logger.info('AI extraction pipeline complete', {
    totalRecordsExtracted: allRecords.length,
    totalSkipped: allSkipped.length,
    successfulBatches,
    failedBatches: failedBatchCount,
    totalBatches,
    processingTimeMs,
    avgMsPerBatch: totalBatches > 0 ? Math.round(processingTimeMs / totalBatches) : 0,
    avgMsPerRecord: records.length > 0 ? Math.round(processingTimeMs / records.length) : 0,
  });

  return {
    records: allRecords,
    skipped: allSkipped,
    batchesProcessed: successfulBatches,
    totalBatches,
    failedBatches: failedBatchCount,
    processingTimeMs,
  };
}

/**
 * Process a single batch through the AI pipeline.
 *
 * Flow:
 * 1. Build user prompt with headers + batch data
 * 2. Call LLM with retry wrapper
 * 3. Parse response (two-pass: direct → repair)
 * 4. Validate and sanitize (with hallucination detection)
 *
 * If all retries fail, the batch is NOT thrown away —
 * its records become "skipped" with the failure reason.
 * This ensures partial results are always returned.
 */
async function processOneBatch(
  systemPrompt: string,
  headers: string[],
  batch: RawCSVRecord[],
  batchIndex: number,
  totalBatches: number,
  globalRowOffset: number
): Promise<BatchResult> {
  const batchLabel = `batch ${batchIndex + 1}/${totalBatches}`;
  const userPrompt = buildUserPrompt(headers, batch, batchIndex, totalBatches);

  logger.debug(`Processing ${batchLabel}`, {
    batchIndex,
    recordCount: batch.length,
    userPromptLength: userPrompt.length,
  });

  try {
    // ─── Step 1: Call LLM with retry ───────────
    const responseText = await withRetry(
      () => callLLM(systemPrompt, userPrompt),
      `AI ${batchLabel}`,
      {
        maxRetries: config.maxRetries,
        baseDelayMs: config.retryBaseDelayMs,
      }
    );

    // ─── Step 2: Parse response ────────────────
    // Two-pass: direct parse → repair service
    const aiResponse = parseAIResponse(responseText);

    logger.debug(`${batchLabel} parsed successfully`, {
      recordsReturned: aiResponse.records.length,
      skippedReturned: aiResponse.skipped.length,
    });

    // ─── Step 3: Validate + sanitize ───────────
    // Pass original batch data for hallucination detection
    const validatedResult = validateBatchResponse(
      aiResponse,
      batchIndex,
      globalRowOffset,
      batch  // ← original data for hallucination cross-check
    );

    return validatedResult;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errDetails = (error as any).details ? String((error as any).details) : '';
    const fullErrText = (errMsg + ' ' + errDetails).toLowerCase();

    const isRateLimitedOrQuotaError = 
      fullErrText.includes('429') || 
      fullErrText.includes('quota') || 
      fullErrText.includes('resource_exhausted') || 
      fullErrText.includes('api key not valid') ||
      fullErrText.includes('not found') ||
      fullErrText.includes('api_key_invalid') ||
      fullErrText.includes('invalid api key') ||
      fullErrText.includes('incorrect api key') ||
      fullErrText.includes('unauthorized') ||
      fullErrText.includes('401') ||
      fullErrText.includes('model not found') ||
      fullErrText.includes('not initialized') ||
      fullErrText.includes('openai model failed to process the data');

    if (isRateLimitedOrQuotaError) {
      logger.warn(`Rate limit/quota or API Key error detected for ${batchLabel}. Activating local semantic fallback mapping...`, {
        error: errMsg,
        details: errDetails
      });

      // Map rows heuristically
      const fallbackRecords = batch.map(row => extractRowHeuristically(row));

      // Validate results through the standard validation service
      const validatedResult = validateBatchResponse(
        { records: fallbackRecords, skipped: [] },
        batchIndex,
        globalRowOffset,
        batch
      );

      return {
        ...validatedResult,
        success: true // override success to reflect successful recovery
      };
    }

    // ─── Graceful Failure ──────────────────────
    // If all retries exhausted, don't crash the entire import.
    // Convert this batch's records to "skipped" with the error reason.
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`${batchLabel} failed after all retries`, {
      batchIndex,
      error: errorMessage,
      recordCount: batch.length,
    });

    // Create skipped records for every record in this batch
    const failedSkipped: SkippedRecord[] = batch.map((record, i) => ({
      rowIndex: globalRowOffset + i,
      reason: `AI processing failed: ${errorMessage}`,
      originalData: record,
    }));

    return {
      records: [],
      skipped: failedSkipped,
      batchIndex,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Call the Google Gemini API.
 *
 * Configuration choices:
 * - responseMimeType: "application/json" — forces structured JSON output,
 *   dramatically reducing parse failures
 * - temperature: 0.1 — near-deterministic output for consistent extraction.
 *   Higher temperatures cause creative field mapping "guesses".
 * - maxOutputTokens: 8192 — generous limit to handle large batches.
 *   20 records × ~200 tokens/record = ~4000 tokens typical.
 *
 * Error classification for retry:
 * - 429 (RESOURCE_EXHAUSTED) → retryable (rate limit)
 * - 500/503 (INTERNAL) → retryable (transient server error)
 * - 400 (INVALID_ARGUMENT) → NOT retryable (bad request)
 * - 403 (PERMISSION_DENIED) → NOT retryable (auth error)
 *
 * @returns Raw text response from the model
 * @throws Error on API failure (caught by retry wrapper)
 */
/**
 * Generic LLM dispatch function. Dispatches requests to
 * Google Gemini or OpenAI based on config.aiProvider.
 */
async function callLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (config.aiProvider === 'openai') {
    return callOpenAI(systemPrompt, userPrompt);
  } else {
    return callGemini(systemPrompt, userPrompt);
  }
}

/**
 * Call the OpenAI Chat Completions API.
 */
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!openai) {
    throw new Error('OpenAI client is not initialized.');
  }

  logger.debug('Calling OpenAI Responses API', {
    model: config.openaiModel,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
  });

  const callStartTime = Date.now();

  try {
    const response = await openai.responses.create({
      model: config.openaiModel,
      instructions: systemPrompt,
      input: userPrompt,
      max_output_tokens: 8192,
    });

    const text = response.output_text || '';
    const callDuration = Date.now() - callStartTime;

    if (!text || text.trim().length === 0) {
      throw new Error('OpenAI model returned an empty response');
    }

    logger.debug('OpenAI API response received', {
      responseLength: text.length,
      durationMs: callDuration,
    });

    return text;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const callDuration = Date.now() - callStartTime;

    logger.error('OpenAI API call failed', {
      error: errMsg,
      durationMs: callDuration,
    });

    // Classify error for retry logic
    if (errMsg.includes('429') || errMsg.includes('Rate limit')) {
      const rateLimitError = new Error(`Rate limited by OpenAI API: ${errMsg}`);
      (rateLimitError as unknown as Record<string, number>).status = 429;
      throw rateLimitError;
    }
    if (errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('504')) {
      const serverError = new Error(`OpenAI server error: ${errMsg}`);
      (serverError as unknown as Record<string, number>).status = 500;
      throw serverError;
    }

    throw new AppError(
      500,
      ERROR_CODES.AI_PROCESSING_ERROR,
      'OpenAI model failed to process the data.',
      errMsg
    );
  }
}

/**
 * Call the Google Gemini API.
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini client is not initialized.');
  }

  logger.debug('Calling Gemini API', {
    model: config.geminiModel,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
    totalPromptChars: systemPrompt.length + userPrompt.length,
    estimatedInputTokens: Math.ceil((systemPrompt.length + userPrompt.length) / 4),
  });

  const model = genAI.getGenerativeModel({
    model: config.geminiModel,
    generationConfig: {
      responseMimeType: 'application/json',  // Force JSON output
      temperature: 0.1,                      // Near-deterministic
      maxOutputTokens: 8192,                 // Generous for large batches
    },
    systemInstruction: systemPrompt,
  });

  let result: GenerateContentResult;
  const callStartTime = Date.now();

  try {
    result = await model.generateContent(userPrompt);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const callDuration = Date.now() - callStartTime;

    logger.error('Gemini API call failed', {
      error: errMsg,
      durationMs: callDuration,
    });

    // Classify error for retry logic
    if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      const rateLimitError = new Error(`Rate limited by Gemini API: ${errMsg}`);
      (rateLimitError as unknown as Record<string, number>).status = 429;
      throw rateLimitError;
    }
    if (errMsg.includes('500') || errMsg.includes('503') || errMsg.includes('INTERNAL')) {
      const serverError = new Error(`Gemini server error: ${errMsg}`);
      (serverError as unknown as Record<string, number>).status = 500;
      throw serverError;
    }
    if (errMsg.includes('DEADLINE_EXCEEDED') || errMsg.includes('timeout')) {
      const timeoutError = new Error(`Gemini timeout: ${errMsg}`);
      (timeoutError as unknown as Record<string, number>).status = 504;
      throw timeoutError;
    }

    // Non-retryable errors (400, 403, etc.) — fail fast
    throw new AppError(
      500,
      ERROR_CODES.AI_PROCESSING_ERROR,
      'AI model failed to process the data.',
      errMsg
    );
  }

  const response = result.response;
  const text = response.text();
  const callDuration = Date.now() - callStartTime;

  if (!text || text.trim().length === 0) {
    throw new Error('AI model returned an empty response');
  }

  logger.debug('Gemini API response received', {
    responseLength: text.length,
    durationMs: callDuration,
    estimatedOutputTokens: Math.ceil(text.length / 4),
  });

  return text;
}
