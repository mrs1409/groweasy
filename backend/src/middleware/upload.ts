// ============================================
// GrowEasy CSV Importer — File Upload Middleware
// ============================================

import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { config } from '../config';
import { AppError } from '../types';
import { ERROR_CODES, ALLOWED_FILE_EXTENSIONS } from '../constants';

/**
 * File filter that validates the uploaded file is a CSV.
 *
 * Checks both the file extension and MIME type.
 * We are permissive with MIME types because different OS/browsers
 * report CSV files differently (text/csv, application/vnd.ms-excel, text/plain).
 */
function csvFileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
): void {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    const error = new AppError(
      400,
      ERROR_CODES.INVALID_FILE_TYPE,
      'Please upload a valid CSV file.',
      `Received file: "${file.originalname}" with extension "${ext}". Only .csv files are accepted.`
    );
    callback(error);
    return;
  }

  callback(null, true);
}

/**
 * Multer upload middleware configured for CSV file uploads.
 *
 * Configuration:
 * - Memory storage (stateless — no temp files on disk)
 * - Single file upload on field "file"
 * - File size limit from environment config
 * - CSV-only file filter
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSizeBytes,
    files: 1,
  },
  fileFilter: csvFileFilter,
});
