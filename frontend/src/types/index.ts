// ============================================
// GrowEasy CSV Importer — Frontend Types
// ============================================

/** A single raw CSV record (key-value string pairs) */
export type RawCSVRecord = Record<string, string>;

/** Parsed CSV data from client-side PapaParse */
export interface ParsedCSV {
  headers: string[];
  rows: RawCSVRecord[];
  totalRows: number;
}

/** A single extracted CRM record from the AI */
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

/** A skipped record with reason */
export interface SkippedRecord {
  rowIndex: number;
  reason: string;
  originalData: Record<string, string>;
}

/** Import statistics from the backend */
export interface ImportStatistics {
  totalRows: number;
  totalImported: number;
  totalSkipped: number;
  processingTimeMs: number;
  batchesProcessed: number;
}

/** Import result data from backend */
export interface ImportResultData {
  records: CRMRecord[];
  skipped: SkippedRecord[];
  statistics: ImportStatistics;
}

/** Successful API response */
export interface APISuccessResponse {
  success: true;
  data: ImportResultData;
}

/** Error API response */
export interface APIErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

/** Combined API response type */
export type APIResponse = APISuccessResponse | APIErrorResponse;

/** Wizard steps */
export type WizardStep = 'upload' | 'preview' | 'processing' | 'results';

/** CRM field names for display */
export const CRM_FIELD_LABELS: Record<keyof CRMRecord, string> = {
  created_at: 'Created At',
  name: 'Name',
  email: 'Email',
  country_code: 'Country Code',
  mobile_without_country_code: 'Mobile',
  company: 'Company',
  city: 'City',
  state: 'State',
  country: 'Country',
  lead_owner: 'Lead Owner',
  crm_status: 'CRM Status',
  crm_note: 'CRM Note',
  data_source: 'Data Source',
  possession_time: 'Possession Time',
  description: 'Description',
};
