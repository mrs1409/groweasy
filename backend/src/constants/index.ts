// ============================================
// GrowEasy CSV Importer — Constants
// ============================================

/**
 * The 15 CRM fields as defined in the assignment (lines 107–136).
 * Used for validation and output sanitization.
 */
export const CRM_FIELDS = [
  'created_at',
  'name',
  'email',
  'country_code',
  'mobile_without_country_code',
  'company',
  'city',
  'state',
  'country',
  'lead_owner',
  'crm_status',
  'crm_note',
  'data_source',
  'possession_time',
  'description',
] as const;

export type CRMFieldName = typeof CRM_FIELDS[number];

/**
 * Allowed CRM status values (assignment lines 153–158).
 * AI must ONLY use one of these values.
 */
export const ALLOWED_CRM_STATUSES = [
  'GOOD_LEAD_FOLLOW_UP',
  'DID_NOT_CONNECT',
  'BAD_LEAD',
  'SALE_DONE',
] as const;

export type CRMStatus = typeof ALLOWED_CRM_STATUSES[number];

/**
 * Allowed data source values (assignment lines 161–166).
 * If none match confidently, the field should be left blank.
 */
export const ALLOWED_DATA_SOURCES = [
  'leads_on_demand',
  'meridian_tower',
  'eden_park',
  'varah_swamy',
  'sarjapur_plots',
] as const;

export type DataSource = typeof ALLOWED_DATA_SOURCES[number];

/**
 * CRM field descriptions — used in the AI prompt to help
 * the model understand what each field represents.
 */
export const CRM_FIELD_DESCRIPTIONS: Record<CRMFieldName, string> = {
  created_at: 'Lead creation date (must be parseable by JavaScript new Date())',
  name: 'Full name of the lead',
  email: 'Primary email address',
  country_code: 'Phone country code (e.g., +91)',
  mobile_without_country_code: 'Mobile number without country code',
  company: 'Company or organization name',
  city: 'City',
  state: 'State or province',
  country: 'Country',
  lead_owner: 'Email or name of the lead owner/assignee',
  crm_status: `Lead status — MUST be one of: ${ALLOWED_CRM_STATUSES.join(', ')}`,
  crm_note: 'Remarks, follow-up notes, extra phone numbers, extra emails, or any useful info',
  data_source: `Lead source — MUST be one of: ${ALLOWED_DATA_SOURCES.join(', ')} or leave blank`,
  possession_time: 'Property possession time (real estate specific)',
  description: 'Additional description or details',
};

// ─── Batch Processing Defaults ──────────────

export const DEFAULT_BATCH_SIZE = 20;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
export const DEFAULT_RETRY_MAX_DELAY_MS = 10000;

// ─── Upload Limits ──────────────────────────

export const DEFAULT_MAX_FILE_SIZE_MB = 10;
export const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/csv',
  'text/x-csv',
  'application/x-csv',
];
export const ALLOWED_FILE_EXTENSIONS = ['.csv'];

// ─── Rate Limiting Defaults ─────────────────

export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 10;

// ─── Error Codes ────────────────────────────

export const ERROR_CODES = {
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  EMPTY_FILE: 'EMPTY_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  NO_FILE_UPLOADED: 'NO_FILE_UPLOADED',
  CSV_PARSE_ERROR: 'CSV_PARSE_ERROR',
  AI_PROCESSING_ERROR: 'AI_PROCESSING_ERROR',
  AI_RESPONSE_PARSE_ERROR: 'AI_RESPONSE_PARSE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

// ─── AI Model Config ────────────────────────

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
export const AI_REQUEST_TIMEOUT_MS = 60_000; // 60 seconds per batch
