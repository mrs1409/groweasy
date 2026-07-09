// ============================================
// GrowEasy CSV Importer — CSV Service
// ============================================

import Papa from 'papaparse';
import { RawCSVRecord, AppError } from '../types';
import { ERROR_CODES } from '../constants';
import { logger } from '../utils/logger';

/**
 * Result of parsing a CSV file.
 */
export interface CSVParseResult {
  headers: string[];
  records: RawCSVRecord[];
  totalRows: number;
}

/**
 * Parse a CSV buffer into structured records.
 *
 * Uses PapaParse for robust CSV handling:
 * - Quoted fields with commas
 * - Various delimiters (auto-detected)
 * - UTF-8 and other encodings
 * - Empty rows filtered out
 *
 * @param buffer - The raw file buffer from Multer
 * @returns Parsed headers and records
 * @throws AppError if CSV is malformed or empty
 */
export function parseCSV(buffer: Buffer): CSVParseResult {
  // Decode buffer to string (UTF-8)
  const csvText = buffer.toString('utf-8');

  if (!csvText.trim()) {
    throw new AppError(
      400,
      ERROR_CODES.EMPTY_FILE,
      'The uploaded CSV file is empty.',
      'File contains no data after decoding.'
    );
  }

  logger.debug('Parsing CSV content', { contentLength: csvText.length });

  // Parse with PapaParse
  const result = Papa.parse<RawCSVRecord>(csvText, {
    header: true,           // First row is headers
    skipEmptyLines: true,   // Skip blank rows
    transformHeader: (header: string) => header.trim(), // Clean whitespace from headers
    transform: (value: string) => value.trim(),         // Clean whitespace from values
  });

  // Check for parse errors
  if (result.errors.length > 0) {
    const criticalErrors = result.errors.filter(
      e => e.type === 'Quotes' || e.type === 'FieldMismatch'
    );

    if (criticalErrors.length > 0) {
      logger.warn('CSV parse errors detected', {
        errorCount: criticalErrors.length,
        errors: criticalErrors.slice(0, 5).map(e => ({
          type: e.type,
          code: e.code,
          message: e.message,
          row: e.row,
        })),
      });
    }

    // Log non-critical errors but don't fail
    if (result.errors.length > 0 && criticalErrors.length === 0) {
      logger.debug('Non-critical CSV parse warnings', {
        warningCount: result.errors.length,
      });
    }
  }

  // Extract headers
  const headers = result.meta.fields || [];

  if (headers.length === 0) {
    throw new AppError(
      422,
      ERROR_CODES.CSV_PARSE_ERROR,
      'Could not detect column headers in the CSV file.',
      'The CSV file appears to have no recognizable header row.'
    );
  }

  // Filter out completely empty records (all values empty)
  const records = result.data.filter(record => {
    return Object.values(record).some(value => value !== '');
  });

  if (records.length === 0) {
    throw new AppError(
      400,
      ERROR_CODES.EMPTY_FILE,
      'The CSV file contains headers but no data rows.',
      `Detected ${headers.length} columns: ${headers.join(', ')}`
    );
  }

  logger.info('CSV parsed successfully', {
    headerCount: headers.length,
    headers: headers,
    recordCount: records.length,
    rawRowCount: result.data.length,
    filteredEmptyRows: result.data.length - records.length,
  });

  return {
    headers,
    records,
    totalRows: records.length,
  };
}
