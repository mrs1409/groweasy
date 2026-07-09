// ============================================
// GrowEasy — History Controller
// ============================================
// GET    /api/imports          — paginated list
// GET    /api/imports/:id      — single import details
// GET    /api/imports/:id/leads — leads for an import
// GET    /api/imports/:id/download — stream original CSV
// DELETE /api/imports/:id      — soft delete

import { Request, Response, NextFunction } from 'express';
import { importRepository } from '../repositories/ImportRepository';
import { leadRepository } from '../repositories/LeadRepository';
import { createCSVReadStream, csvFileExists } from '../services/csvStorageService';
import { logger } from '../utils/logger';
import * as path from 'path';

/**
 * GET /api/imports
 * Paginated import history for the authenticated user, newest first.
 */
export async function getImports(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.dbUser!.id;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10)));

    const result = await importRepository.findAllByUser(userId, { page, limit });

    // Strip filePath from client response (internal implementation detail)
    const imports = result.imports.map(({ filePath, ...rest }) => ({
      ...rest,
      hasFile: csvFileExists(filePath),
    }));

    res.status(200).json({
      success: true,
      data: { imports, pagination: result.pagination },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/imports/:id
 * Single import details. Enforces ownership via userId.
 */
export async function getImportById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.dbUser!.id;
    const importId = parseInt(String(req.params.id), 10);

    if (isNaN(importId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid import ID.' } });
      return;
    }

    const importRecord = await importRepository.findByIdAndUser(importId, userId);
    if (!importRecord) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Import not found.' } });
      return;
    }

    const { filePath, ...safeRecord } = importRecord;

    res.status(200).json({
      success: true,
      data: { import: { ...safeRecord, hasFile: csvFileExists(filePath) } },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/imports/:id/leads
 * Paginated leads for a specific import. Enforces ownership.
 */
export async function getImportLeads(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.dbUser!.id;
    const importId = parseInt(String(req.params.id), 10);

    if (isNaN(importId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid import ID.' } });
      return;
    }

    // Verify import ownership
    const importRecord = await importRepository.findByIdAndUser(importId, userId);
    if (!importRecord) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Import not found.' } });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));

    const result = await leadRepository.findByImport(importId, userId, { page, limit });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/imports/:id/download
 * Stream the original uploaded CSV file back to the client.
 */
export async function downloadImportCSV(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.dbUser!.id;
    const importId = parseInt(String(req.params.id), 10);

    if (isNaN(importId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid import ID.' } });
      return;
    }

    const importRecord = await importRepository.findByIdAndUser(importId, userId);
    if (!importRecord) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Import not found.' } });
      return;
    }

    if (!csvFileExists(importRecord.filePath)) {
      res.status(422).json({
        success: false,
        error: { code: 'FILE_MISSING', message: 'Original CSV file is no longer available.' },
      });
      return;
    }

    const fileName = path.basename(importRecord.filePath!);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const stream = createCSVReadStream(importRecord.filePath!);
    stream.pipe(res);

    logger.info('CSV download streamed', { userId, importId, fileName });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/imports/:id
 * Soft-delete — sets deletedAt. File is kept on disk.
 */
export async function deleteImport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.dbUser!.id;
    const importId = parseInt(String(req.params.id), 10);

    if (isNaN(importId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid import ID.' } });
      return;
    }

    await importRepository.softDelete(importId, userId);
    await leadRepository.deleteByImport(importId);

    logger.info('Import soft-deleted and associated leads deleted', { userId, importId });

    res.status(200).json({
      success: true,
      data: { message: 'Import deleted successfully and associated leads removed.' },
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: error.message } });
      return;
    }
    next(error);
  }
}
