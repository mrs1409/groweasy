// ============================================
// GrowEasy — CSV Storage Service
// ============================================
// Persists uploaded CSV files to disk for retry/download.
// Files stored at: uploads/{userId}/{importId}/{filename}

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

import * as os from 'os';

// Render (and most PaaS) only allow writes to /tmp — /app is read-only.
// Use UPLOADS_DIR env var to override, otherwise auto-detect.
const UPLOADS_DIR = process.env['UPLOADS_DIR'] ||
  (process.env['NODE_ENV'] === 'production'
    ? path.join(os.tmpdir(), 'groweasy-uploads')   // /tmp/groweasy-uploads on Render
    : path.join(process.cwd(), 'uploads'));          // ./uploads in local dev


function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Save a CSV file buffer to disk.
 * Returns the absolute file path for storage in the DB.
 */
export function saveCSVFile(
  userId: number,
  importId: number,
  fileName: string,
  buffer: Buffer
): string {
  const dir = path.join(UPLOADS_DIR, String(userId), String(importId));
  ensureDir(dir);

  // Sanitize filename to prevent path traversal
  const safeFileName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(dir, safeFileName);

  fs.writeFileSync(filePath, buffer);
  logger.info('CSV file saved to disk', { userId, importId, filePath });
  return filePath;
}

/**
 * Read a previously saved CSV file for retry processing.
 */
export function readCSVFile(filePath: string): Buffer {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`CSV file not found at: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

/**
 * Create a readable stream for file download (efficient for large files).
 */
export function createCSVReadStream(filePath: string): fs.ReadStream {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`CSV file not found at: ${filePath}`);
  }
  return fs.createReadStream(filePath);
}

/**
 * Delete stored CSV file (called on hard delete if needed).
 */
export function deleteCSVFile(filePath: string): void {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logger.info('CSV file deleted from disk', { filePath });
  }
}

/**
 * Check if a stored CSV file is still accessible.
 */
export function csvFileExists(filePath: string | null | undefined): boolean {
  return !!(filePath && fs.existsSync(filePath));
}
