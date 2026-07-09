// ============================================
// GrowEasy CSV Importer — Shared TypeScript Types
// ============================================

// ─── CRM Record ─────────────────────────────

/**
 * The 15 CRM fields as defined in the assignment specification.
 * Every field is a string — empty string for missing values.
 */
export interface CRMRecord {
  created_at: string;
  name: string;
  email: string;
  country_code: string;
  mobile_without_country_code: string;
  company: string;
  city: string;
  state: string;
  country: string;
  lead_owner: string;
  crm_status: string;
  crm_note: string;
  data_source: string;
  possession_time: string;
  description: string;
}

// ─── Skipped Record ─────────────────────────

/**
 * A record that was skipped during AI extraction,
 * along with the reason and original data for display.
 */
export interface SkippedRecord {
  rowIndex: number;
  reason: string;
  originalData: Record<string, string>;
}

// ─── Import Statistics ──────────────────────

/**
 * Summary statistics returned with every import response.
 */
export interface ImportStatistics {
  totalRows: number;
  totalImported: number;
  totalSkipped: number;
  processingTimeMs: number;
  batchesProcessed: number;
}

// ─── API Response Types ─────────────────────

/**
 * Successful import response shape.
 */
export interface ImportResultData {
  records: CRMRecord[];
  skipped: SkippedRecord[];
  statistics: ImportStatistics;
}

/**
 * Standardized success response envelope.
 */
export interface APISuccessResponse<T = ImportResultData> {
  success: true;
  data: T;
}

/**
 * Standardized error response envelope.
 */
export interface APIErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

/**
 * Union type for all API responses.
 */
export type APIResponse<T = ImportResultData> = APISuccessResponse<T> | APIErrorResponse;

// ─── AI Service Types ───────────────────────

/**
 * Raw parsed CSV record — arbitrary key-value pairs
 * since column names are not fixed.
 */
export type RawCSVRecord = Record<string, string>;

/**
 * The expected shape of the AI model's JSON response
 * for a single batch.
 */
export interface AIBatchResponse {
  records: CRMRecord[];
  skipped: Array<{
    row_index: number;
    reason: string;
    original_data: Record<string, string>;
  }>;
}

/**
 * Result of processing a single batch, including
 * metadata about the batch processing.
 */
export interface BatchResult {
  records: CRMRecord[];
  skipped: SkippedRecord[];
  batchIndex: number;
  success: boolean;
  error?: string;
}

// ─── Error Types ────────────────────────────

/**
 * Application-level error with an error code
 * for structured error responses.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: string;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ─── Health Check ───────────────────────────

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
}

// ─── Batch Processor Types ──────────────────

/**
 * Progress callback invoked after each batch completes.
 */
export type BatchProgressCallback = (
  completedBatches: number,
  totalBatches: number,
  batchResult: BatchResult
) => void;

/**
 * Configuration for the batch processor utility.
 */
export interface BatchProcessorConfig<T, R> {
  items: T[];
  batchSize: number;
  processor: (batch: T[], batchIndex: number) => Promise<R>;
  onProgress?: (completed: number, total: number, result: R) => void;
}

// ─── Retry Types ────────────────────────────

/**
 * Configuration for the retry utility.
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses?: number[];
}

declare global {
  namespace Express {
    interface Request {
      /** Firebase decoded token claims */
      user?: {
        uid: string;
        email?: string;
        name?: string;
        picture?: string;
        [key: string]: any;
      };
      /** Authenticated user row from Prisma DB */
      dbUser?: import('@prisma/client').User;
    }
  }
}

// ─── Dashboard API Types ─────────────────────

export interface DashboardStats {
  totalImports: number;
  totalLeads: number;
  totalSkipped: number;
  totalRows: number;
  avgProcessingTimeMs: number;
  successRate: number;
  completedImports: number;
  failedImports: number;
  recentImports: ImportRecord[];
}

export interface ImportRecord {
  id: number;
  fileName: string;
  status: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  durationMs: number | null;
  errorMessage: string | null;
  filePath: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ImportHistoryResponse {
  imports: ImportRecord[];
  pagination: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

