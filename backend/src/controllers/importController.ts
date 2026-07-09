// ============================================
// GrowEasy CSV Importer — Import Controller
// ============================================
// Handles: POST /api/imports (new import)
//          POST /api/imports/:id/retry (retry failed import)
//          GET  /api/health (health check)
// ============================================

import { Request, Response, NextFunction } from 'express';
import {
  AppError,
  APISuccessResponse,
  ImportResultData,
  ImportStatistics,
  HealthResponse,
} from '../types';
import { ERROR_CODES } from '../constants';
import { parseCSV } from '../services/csvService';
import { extractCRMRecords } from '../services/aiService';
import { logger } from '../utils/logger';
import { importRepository } from '../repositories/ImportRepository';
import { leadRepository } from '../repositories/LeadRepository';
import { saveCSVFile, readCSVFile, csvFileExists } from '../services/csvStorageService';
import { v4 as uuidv4 } from 'uuid';
import { progressService } from '../services/progressService';
import { config } from '../config';

/**
 * POST /api/imports
 *
 * Flow:
 * 1. Validate file presence
 * 2. Create Import record in DB (status=PROCESSING)
 * 3. Save CSV to disk for retry/download
 * 4. Parse CSV into headers + records
 * 5. Run AI extraction pipeline
 * 6. Bulk-insert Lead records
 * 7. Update Import record (COMPLETED + stats)
 * 8. Return structured response with importId
 */
export async function handleImport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const requestId = uuidv4();
  const startTime = Date.now();
  const userId = req.dbUser!.id;
  const progressId = (req.headers['x-progress-id'] || req.query.progressId || req.body.progressId) as string | undefined;

  logger.info('Import request received', { requestId, userId, progressId });

  // Initialize importRecord outside try so we can reference it in catch
  let importRecord: { id: number } | null = null;

  try {
    // ─── Step 0: Create Import record in DB ────
    importRecord = await importRepository.create({
      userId,
      fileName: req.file?.originalname ?? 'unknown.csv',
    });

    if (progressId) {
      progressService.send(progressId, {
        percentage: 10,
        stage: 'Uploading CSV',
      });
    }

    // ─── Step 1: Validate file presence ────────
    if (!req.file) {
      await importRepository.update(importRecord.id, userId, {
        status: 'FAILED',
        errorMessage: 'No file uploaded.',
      });
      throw new AppError(
        400,
        ERROR_CODES.NO_FILE_UPLOADED,
        'No file was uploaded. Please select a CSV file.'
      );
    }

    logger.info('File received', {
      requestId,
      originalName: req.file.originalname,
      sizeBytes: req.file.size,
    });

    // ─── Step 2: Save CSV to disk ───────────────
    const filePath = saveCSVFile(
      userId,
      importRecord.id,
      req.file.originalname,
      req.file.buffer
    );
    await importRepository.update(importRecord.id, userId, { filePath });

    // ─── Step 3: Parse CSV ─────────────────────
    if (progressId) {
      progressService.send(progressId, {
        percentage: 20,
        stage: 'Parsing CSV',
      });
    }
    const { headers, records, totalRows } = parseCSV(req.file.buffer);
    logger.info('CSV parsed', { requestId, headers, totalRows });

    // ─── Step 4: AI Extraction ─────────────────
    const totalBatches = Math.ceil(records.length / config.batchSize);
    if (progressId) {
      progressService.send(progressId, {
        percentage: 30,
        stage: 'Creating Batches',
        totalRows,
        totalBatches,
      });
    }

    const extractionResult = await extractCRMRecords(headers, records, (completed, total, processed) => {
      if (progressId) {
        const elapsedMs = progressService.getElapsedTimeMs(progressId);
        const avgTimePerBatch = elapsedMs / completed;
        const remainingBatches = total - completed;
        const estimatedRemainingTimeMs = remainingBatches * avgTimePerBatch;

        // Map AI extraction from 35% to 80%
        const aiPercentage = Math.round(35 + (completed / total) * 45);

        progressService.send(progressId, {
          percentage: aiPercentage,
          stage: 'AI Extraction',
          processedRows: processed,
          totalRows,
          currentBatch: completed,
          totalBatches: total,
          estimatedRemainingTimeMs,
        });
      }
    });

    // ─── Step 5: Validate AI Output ────────────
    if (progressId) {
      progressService.send(progressId, {
        percentage: 85,
        stage: 'Validating AI Output',
        processedRows: totalRows,
        totalRows,
        currentBatch: totalBatches,
        totalBatches,
      });
    }

    // ─── Step 6: Persist Leads ─────────────────
    if (progressId) {
      progressService.send(progressId, {
        percentage: 90,
        stage: 'Saving to Database',
        processedRows: totalRows,
        totalRows,
        currentBatch: totalBatches,
        totalBatches,
      });
    }
    if (extractionResult.records.length > 0) {
      await leadRepository.createMany(userId, importRecord.id, extractionResult.records);
    }

    // ─── Step 7: Calculate Statistics ──────────
    const durationMs = Date.now() - startTime;
    const statistics: ImportStatistics = {
      totalRows,
      totalImported: extractionResult.records.length,
      totalSkipped: extractionResult.skipped.length,
      processingTimeMs: extractionResult.processingTimeMs,
      batchesProcessed: extractionResult.batchesProcessed,
    };

    // ─── Step 8: Update Import Record ──────────
    await importRepository.update(importRecord.id, userId, {
      status: 'COMPLETED',
      totalRows,
      importedRows: extractionResult.records.length,
      skippedRows: extractionResult.skipped.length,
      durationMs,
    });

    logger.info('Import complete', {
      requestId,
      importId: importRecord.id,
      ...statistics,
    });

    // ─── Step 9: Return Response ───────────────
    const response: APISuccessResponse<ImportResultData & { importId: number }> = {
      success: true,
      data: {
        importId: importRecord.id,
        records: extractionResult.records,
        skipped: extractionResult.skipped,
        statistics,
      },
    };

    if (progressId) {
      progressService.complete(progressId);
    }

    res.status(200).json(response);
  } catch (error: any) {
    // Mark import as failed in DB
    if (importRecord) {
      await importRepository
        .update(importRecord.id, userId, {
          status: 'FAILED',
          durationMs: Date.now() - startTime,
          errorMessage: error?.message ?? 'Unknown error',
        })
        .catch(() => {}); // best effort
    }
    if (progressId) {
      progressService.fail(progressId, error?.message ?? 'Unknown error');
    }
    next(error);
  }
}

/**
 * POST /api/imports/:id/retry
 *
 * Re-runs AI extraction on a previously uploaded CSV.
 * Deletes old leads, re-inserts new ones.
 */
/**
 * POST /api/imports/:id/retry
 *
 * Re-runs AI extraction on a previously uploaded CSV.
 * Deletes old leads, re-inserts new ones.
 */
export async function retryImport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const requestId = uuidv4();
  const startTime = Date.now();
  const userId = req.dbUser!.id;
  const importId = parseInt(String(req.params.id), 10);
  const progressId = (req.headers['x-progress-id'] || req.query.progressId || req.body.progressId) as string | undefined;

  if (isNaN(importId)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid import ID.' },
    });
    return;
  }

  logger.info('Retry request received', { requestId, userId, importId, progressId });

  // Verify ownership
  const importRecord = await importRepository.findByIdAndUser(importId, userId);
  if (!importRecord) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Import not found.' },
    });
    return;
  }

  if (!csvFileExists(importRecord.filePath)) {
    res.status(422).json({
      success: false,
      error: {
        code: 'FILE_MISSING',
        message: 'Original CSV file is no longer available for retry.',
      },
    });
    return;
  }

  if (progressId) {
    progressService.send(progressId, {
      percentage: 10,
      stage: 'Uploading CSV',
    });
  }

  // Reset to PROCESSING
  await importRepository.update(importId, userId, {
    status: 'PROCESSING',
    errorMessage: null,
  });

  try {
    // Read original file
    if (progressId) {
      progressService.send(progressId, {
        percentage: 20,
        stage: 'Parsing CSV',
      });
    }
    const buffer = readCSVFile(importRecord.filePath!);
    const { headers, records, totalRows } = parseCSV(buffer);

    // Re-run AI extraction
    const totalBatches = Math.ceil(records.length / config.batchSize);
    if (progressId) {
      progressService.send(progressId, {
        percentage: 30,
        stage: 'Creating Batches',
        totalRows,
        totalBatches,
      });
    }

    const extractionResult = await extractCRMRecords(headers, records, (completed, total, processed) => {
      if (progressId) {
        const elapsedMs = progressService.getElapsedTimeMs(progressId);
        const avgTimePerBatch = elapsedMs / completed;
        const remainingBatches = total - completed;
        const estimatedRemainingTimeMs = remainingBatches * avgTimePerBatch;

        // Map AI extraction from 35% to 80%
        const aiPercentage = Math.round(35 + (completed / total) * 45);

        progressService.send(progressId, {
          percentage: aiPercentage,
          stage: 'AI Extraction',
          processedRows: processed,
          totalRows,
          currentBatch: completed,
          totalBatches: total,
          estimatedRemainingTimeMs,
        });
      }
    });

    // ─── Validate AI Output ────────────
    if (progressId) {
      progressService.send(progressId, {
        percentage: 85,
        stage: 'Validating AI Output',
        processedRows: totalRows,
        totalRows,
        currentBatch: totalBatches,
        totalBatches,
      });
    }

    // Delete old leads, insert new ones
    if (progressId) {
      progressService.send(progressId, {
        percentage: 90,
        stage: 'Saving to Database',
        processedRows: totalRows,
        totalRows,
        currentBatch: totalBatches,
        totalBatches,
      });
    }

    await leadRepository.deleteByImport(importId);
    if (extractionResult.records.length > 0) {
      await leadRepository.createMany(userId, importId, extractionResult.records);
    }

    const durationMs = Date.now() - startTime;
    const statistics: ImportStatistics = {
      totalRows,
      totalImported: extractionResult.records.length,
      totalSkipped: extractionResult.skipped.length,
      processingTimeMs: extractionResult.processingTimeMs,
      batchesProcessed: extractionResult.batchesProcessed,
    };

    await importRepository.update(importId, userId, {
      status: 'COMPLETED',
      totalRows,
      importedRows: extractionResult.records.length,
      skippedRows: extractionResult.skipped.length,
      durationMs,
      errorMessage: null,
    });

    logger.info('Retry complete', { requestId, importId, ...statistics });

    if (progressId) {
      progressService.complete(progressId);
    }

    res.status(200).json({
      success: true,
      data: {
        importId,
        records: extractionResult.records,
        skipped: extractionResult.skipped,
        statistics,
      },
    });
  } catch (error: any) {
    await importRepository
      .update(importId, userId, {
        status: 'FAILED',
        durationMs: Date.now() - startTime,
        errorMessage: error?.message ?? 'Retry failed',
      })
      .catch(() => {});
    if (progressId) {
      progressService.fail(progressId, error?.message ?? 'Retry failed');
    }
    next(error);
  }
}

/**
 * GET /api/imports/progress/:progressId
 *
 * Establishes real-time Server-Sent Events (SSE) progress update streams.
 */
export function handleImportProgress(req: Request, res: Response): void {
  const progressId = req.params.progressId as string;

  if (!progressId) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Missing progress ID.' },
    });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(':\n\n'); // send heartbeat comment
  progressService.register(progressId, res);

  req.on('close', () => {
    progressService.unregister(progressId);
  });
}

/**
 * GET /api/health — Public health check endpoint.
 */
export function handleHealthCheck(_req: Request, res: Response): void {
  const response: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
  };
  res.status(200).json(response);
}
