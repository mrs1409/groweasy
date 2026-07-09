// ============================================
// GrowEasy CSV Importer — Error Handler Middleware
// ============================================

import { Request, Response, NextFunction } from 'express';
import { AppError, APIErrorResponse } from '../types';
import { ERROR_CODES } from '../constants';
import { logger } from '../utils/logger';
import multer from 'multer';

/**
 * Global error handling middleware for Express.
 *
 * Catches all errors thrown in route handlers and middleware,
 * and transforms them into structured API error responses.
 *
 * Error types handled:
 * 1. AppError — our custom typed errors → structured response
 * 2. MulterError — file upload errors → 400 with specific message
 * 3. SyntaxError — malformed JSON body → 400
 * 4. Unknown errors — generic 500 with safe message
 *
 * NEVER exposes stack traces or internal details to the client
 * in production (clean UX requirement).
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ─── AppError (our custom errors) ───────────
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.code} — ${err.message}`, {
      code: err.code,
      statusCode: err.statusCode,
      details: err.details,
    });

    const response: APIErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // ─── Multer Errors (file upload) ────────────
  if (err instanceof multer.MulterError) {
    logger.warn(`MulterError: ${err.code} — ${err.message}`, {
      code: err.code,
      field: err.field,
    });

    let message = 'File upload failed.';
    let code: string = ERROR_CODES.INTERNAL_ERROR;

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File is too large. Please upload a file under 10MB.';
        code = ERROR_CODES.FILE_TOO_LARGE;
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field. Please use the "file" field for upload.';
        code = ERROR_CODES.INVALID_FILE_TYPE;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files. Please upload only one CSV file.';
        code = ERROR_CODES.INVALID_FILE_TYPE;
        break;
      default:
        message = `File upload error: ${err.message}`;
    }

    const response: APIErrorResponse = {
      success: false,
      error: { code, message },
    };

    res.status(400).json(response);
    return;
  }

  // ─── JSON Syntax Errors ─────────────────────
  if (err instanceof SyntaxError && 'body' in err) {
    const response: APIErrorResponse = {
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid JSON in request body.',
      },
    };

    res.status(400).json(response);
    return;
  }

  // ─── Unknown/Unexpected Errors ──────────────
  logger.error(`Unhandled error: ${err.message}`, {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });

  const response: APIErrorResponse = {
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'An unexpected error occurred. Please try again.',
      // Only include details in development
      details: process.env['NODE_ENV'] !== 'production' ? err.message : undefined,
    },
  };

  res.status(500).json(response);
}
