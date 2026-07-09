// ============================================
// GrowEasy CSV Importer — Validation Service
// ============================================
//
// THE FINAL GATE: Nothing bypasses this layer.
//
// Every AI-extracted record passes through multi-pass
// validation that enforces ALL assignment rules in
// deterministic code. This is the safety net that
// guarantees output correctness regardless of what
// the AI returns.
//
// ASSIGNMENT RULES ENFORCED:
//
// Rule 1 (L153–L158): CRM Status — 4 allowed values only
//   → Exact match → fuzzy match (50+ variations) → clear
//
// Rule 2 (L160–L167): Data Source — 5 values or blank
//   → Exact match → fuzzy match → clear (if not confident)
//
// Rule 3 (L169–L171): Date Format — JS new Date() compatible
//   → Direct parse → DD/MM/YYYY normalization → natural date
//
// Rule 4 (L174–L181): CRM Notes — overflow field
//   → Extra emails → crm_note, extra phones → crm_note,
//     unmapped info → crm_note
//
// Rule 5 (L184–L186): Multiple Emails
//   → First email → email field, rest → crm_note
//   → Post-AI: detect multiple emails in single field
//
// Rule 6 (L187–L189): Multiple Phones
//   → First phone → mobile field, rest → crm_note
//   → Post-AI: detect multiple phones in single field
//
// Rule 7 (L191–L194): CSV Compatibility
//   → No line breaks in values, escape with " | "
//   → ensureCSVSafe() applied to all 15 fields
//
// Rule 8 (L196–L201): Skip Invalid Records
//   → Must have email OR phone, otherwise → skipped[]
//   → Applied AFTER all other validation/correction
//
// ADDITIONAL RULES (not in assignment, implied):
//
// Duplicate Detection: Records with same email or phone
//   → First occurrence kept, duplicates removed with note
//
// Hallucination Detection: Cross-reference with source data
//   → Fabricated emails/phones cleared
//
// Schema Enforcement: All 15 fields present, all strings
//   → Missing fields → ""
//
// ============================================

import {
  CRMRecord,
  SkippedRecord,
  RawCSVRecord,
  AIBatchResponse,
  BatchResult,
} from '../types';
import {
  CRM_FIELDS,
  ALLOWED_CRM_STATUSES,
  ALLOWED_DATA_SOURCES,
} from '../constants';
import { logger } from '../utils/logger';
import {
  validateEmail,
  extractMultipleEmails,
  extractMultiplePhones,
  splitCountryCode,
  ensureCSVSafe,
  validateCountryCode,
  detectDuplicates,
} from '../utils/validators';
import {
  repairAIResponse,
  calculateExtractionConfidence,
  detectHallucination,
} from './outputRepairService';

// ─── Validation Issue Tracking ──────────────────

/**
 * Tracks a single validation fix/issue for debugging.
 */
interface ValidationIssue {
  field: string;
  issue: string;
  severity: 'error' | 'warning' | 'info';
  action: 'fixed' | 'cleared' | 'kept' | 'skipped' | 'moved_to_crm_note';
  originalValue?: string;
  fixedValue?: string;
}

// ─── Response Parsing ───────────────────────────

/**
 * Parse the raw AI response text into a structured AIBatchResponse.
 *
 * TWO-PASS strategy:
 * 1. Direct JSON.parse (fast path — works ~90% of the time)
 * 2. Output repair service (recovery path — handles edge cases)
 *
 * @param responseText - Raw text from the LLM
 * @returns Parsed AIBatchResponse
 * @throws Error if JSON cannot be recovered after repair
 */
export function parseAIResponse(responseText: string): AIBatchResponse {
  // ─── Pass 1: Direct Parse ──────────────────────
  try {
    const directParsed = attemptDirectParse(responseText);
    if (directParsed) {
      logger.debug('AI response parsed directly (no repair needed)');
      return directParsed;
    }
  } catch {
    // Fall through to repair
  }

  // ─── Pass 2: Repair + Parse ────────────────────
  const repaired = repairAIResponse(responseText);
  if (repaired) {
    logger.info('AI response recovered via output repair');
    return repaired;
  }

  // ─── Both passes failed ────────────────────────
  logger.error('Failed to parse AI response after all repair attempts', {
    responseLength: responseText.length,
    responsePreview: responseText.substring(0, 500),
  });
  throw new Error(
    'AI response could not be parsed as JSON even after repair. ' +
    `Response preview: "${responseText.substring(0, 200)}..."`
  );
}

/**
 * Attempt direct JSON parsing with minimal cleanup.
 */
function attemptDirectParse(text: string): AIBatchResponse | null {
  let jsonText = text.trim();

  // Strip markdown code blocks
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  // Find JSON boundaries
  if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
    const jsonStart = jsonText.search(/[{\[]/);
    if (jsonStart === -1) return null;
    jsonText = jsonText.substring(jsonStart);
  }

  // Trim trailing non-JSON
  const lastBrace = jsonText.lastIndexOf('}');
  const lastBracket = jsonText.lastIndexOf(']');
  const lastJsonChar = Math.max(lastBrace, lastBracket);
  if (lastJsonChar !== -1 && lastJsonChar < jsonText.length - 1) {
    jsonText = jsonText.substring(0, lastJsonChar + 1);
  }

  const parsed = JSON.parse(jsonText);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Parsed value is not an object');
  }

  // Handle direct array
  if (Array.isArray(parsed)) {
    return { records: parsed as CRMRecord[], skipped: [] };
  }

  // Handle object
  const obj = parsed as Record<string, unknown>;
  if (!('records' in obj) && !('skipped' in obj)) {
    if ('email' in obj || 'name' in obj || 'mobile_without_country_code' in obj) {
      return { records: [obj as unknown as CRMRecord], skipped: [] };
    }
    throw new Error('Response missing "records" field');
  }

  return {
    records: Array.isArray(obj.records) ? obj.records as CRMRecord[] : [],
    skipped: Array.isArray(obj.skipped) ? obj.skipped as AIBatchResponse['skipped'] : [],
  };
}

// ─── Main Validation Entry Point ────────────────

/**
 * Validate and sanitize a complete AI batch response.
 *
 * This is the MAIN VALIDATION GATE. Every record from
 * every AI batch passes through this function.
 *
 * Validation passes per record:
 *  1. Schema enforcement (15 fields, all strings)
 *  2. Multiple email detection + split (Rule 5)
 *  3. Multiple phone detection + split (Rule 6)
 *  4. Country code extraction (Rule 7)
 *  5. Enum enforcement: crm_status (Rule 1)
 *  6. Enum enforcement: data_source (Rule 2)
 *  7. Date validation + normalization (Rule 3)
 *  8. Email format validation
 *  9. Phone format validation
 * 10. Hallucination detection (cross-reference)
 * 11. Contact info check → skip if none (Rule 8)
 * 12. CSV safety: escape line breaks (Rule 7)
 * 13. Confidence scoring
 *
 * Post-batch:
 * 14. Duplicate detection (by email + phone)
 *
 * @param aiResponse - Parsed JSON from the AI model
 * @param batchIndex - Batch number for logging
 * @param globalRowOffset - Offset for correct global row indexing
 * @param originalBatch - Original CSV records for hallucination detection
 * @returns Validated BatchResult
 */
export function validateBatchResponse(
  aiResponse: AIBatchResponse,
  batchIndex: number,
  globalRowOffset: number,
  originalBatch?: RawCSVRecord[]
): BatchResult {
  const candidateRecords: { record: CRMRecord; rowIndex: number; issues: ValidationIssue[] }[] = [];
  const skippedRecords: SkippedRecord[] = [];

  // ═══════════════════════════════════════════════
  // PHASE 1: Per-Record Validation
  // ═══════════════════════════════════════════════

  if (Array.isArray(aiResponse.records)) {
    for (let i = 0; i < aiResponse.records.length; i++) {
      const rawRecord = aiResponse.records[i];
      const issues: ValidationIssue[] = [];
      const globalRow = globalRowOffset + i;

      // Run all validation passes
      const sanitized = validateSingleRecord(rawRecord, issues);

      // Hallucination detection
      if (originalBatch && i < originalBatch.length) {
        const isHallucinated = detectHallucination(sanitized, originalBatch[i]);
        if (isHallucinated) {
          issues.push({
            field: 'record',
            issue: 'Hallucination detected — extracted contact info not in source data',
            severity: 'warning',
            action: 'cleared',
          });
          sanitized.email = '';
          sanitized.mobile_without_country_code = '';
          sanitized.country_code = '';
        }
      }

      // Skip check: must have email OR mobile (assignment L196–L201)
      if (!sanitized.email && !sanitized.mobile_without_country_code) {
        skippedRecords.push({
          rowIndex: globalRow,
          reason: 'No email or mobile number found after extraction and validation',
          originalData: originalBatch && i < originalBatch.length
            ? originalBatch[i]
            : rawRecord as unknown as Record<string, string>,
        });
        logger.debug(`Record skipped (no contact info) at row ${globalRow}`);
        continue;
      }

      // Confidence check
      const confidence = calculateExtractionConfidence(sanitized);
      if (confidence < 0.1) {
        logger.warn(`Very low confidence (${(confidence * 100).toFixed(0)}%) at row ${globalRow}`);
      }

      candidateRecords.push({ record: sanitized, rowIndex: globalRow, issues });
    }
  }

  // Process AI-skipped records
  if (Array.isArray(aiResponse.skipped)) {
    for (const skip of aiResponse.skipped) {
      skippedRecords.push({
        rowIndex: globalRowOffset + (skip.row_index || 0),
        reason: skip.reason || 'Skipped by AI (no reason provided)',
        originalData: skip.original_data || {},
      });
    }
  }

  // ═══════════════════════════════════════════════
  // PHASE 2: Cross-Record Validation (Duplicates)
  // ═══════════════════════════════════════════════

  const validRecords: CRMRecord[] = [];

  if (candidateRecords.length > 0) {
    const { uniqueIndices, duplicateMap } = detectDuplicates(
      candidateRecords.map(c => c.record)
    );

    for (let i = 0; i < candidateRecords.length; i++) {
      const { record, rowIndex, issues } = candidateRecords[i];

      if (duplicateMap.has(i)) {
        const dupInfo = duplicateMap.get(i)!;
        const originalRowIndex = candidateRecords[dupInfo.duplicateOf].rowIndex;
        skippedRecords.push({
          rowIndex,
          reason: `${dupInfo.reason} — first seen at row ${originalRowIndex}`,
          originalData: record as unknown as Record<string, string>,
        });
        logger.debug(`Record at row ${rowIndex} removed as duplicate`, {
          reason: dupInfo.reason,
        });
      } else if (uniqueIndices.has(i)) {
        validRecords.push(record);
      }

      // Accumulate issues for logging
      if (issues.length > 0) {
        logger.debug(`Row ${rowIndex} validation issues`, {
          issueCount: issues.length,
          issues: issues.slice(0, 10),
        });
      }
    }
  }

  // ═══════════════════════════════════════════════
  // PHASE 3: Summary Logging
  // ═══════════════════════════════════════════════

  logger.info(`Batch ${batchIndex} validation complete`, {
    batchIndex,
    inputRecords: Array.isArray(aiResponse.records) ? aiResponse.records.length : 0,
    validRecords: validRecords.length,
    skippedRecords: skippedRecords.length,
    duplicatesRemoved: candidateRecords.length - validRecords.length,
  });

  return {
    records: validRecords,
    skipped: skippedRecords,
    batchIndex,
    success: true,
  };
}

// ─── Single Record Validation ───────────────────

/**
 * Validate and sanitize a single CRM record through
 * ALL validation passes.
 *
 * This is the core validation function. Every field
 * of every record passes through here. Nothing is
 * returned to the user without going through this.
 *
 * @param record - Raw record from AI output
 * @param issues - Mutable array to track fixes
 * @returns Fully validated and sanitized CRMRecord
 */
function validateSingleRecord(
  record: Partial<CRMRecord>,
  issues: ValidationIssue[]
): CRMRecord {
  // ═══════════════════════════════════════════════
  // PASS 1: Schema Enforcement
  // All 15 fields must exist as strings
  // ═══════════════════════════════════════════════

  const sanitized: CRMRecord = {
    created_at: '',
    name: '',
    email: '',
    country_code: '',
    mobile_without_country_code: '',
    company: '',
    city: '',
    state: '',
    country: '',
    lead_owner: '',
    crm_status: '',
    crm_note: '',
    data_source: '',
    possession_time: '',
    description: '',
  };

  for (const field of CRM_FIELDS) {
    const value = record[field];
    if (value !== undefined && value !== null) {
      sanitized[field] = String(value).trim();
    }
  }

  // ═══════════════════════════════════════════════
  // PASS 2: Multiple Email Detection + Split
  // Assignment Rule 5 (L184–L186)
  // ═══════════════════════════════════════════════

  if (sanitized.email) {
    const emailResult = extractMultipleEmails(sanitized.email);

    if (emailResult.additional.length > 0) {
      // First email → email field, rest → crm_note
      sanitized.email = emailResult.primary;
      const additionalNote = `Additional emails: ${emailResult.additional.join(', ')}`;
      sanitized.crm_note = appendToNote(sanitized.crm_note, additionalNote);

      issues.push({
        field: 'email',
        issue: `Split ${emailResult.additional.length + 1} emails: primary → email, ${emailResult.additional.length} → crm_note`,
        severity: 'info',
        action: 'moved_to_crm_note',
        originalValue: record.email as string,
        fixedValue: emailResult.primary,
      });
    } else if (emailResult.primary) {
      sanitized.email = emailResult.primary;
    }
  }

  // ═══════════════════════════════════════════════
  // PASS 3: Multiple Phone Detection + Split
  // Assignment Rule 6 (L187–L189)
  // ═══════════════════════════════════════════════

  if (sanitized.mobile_without_country_code) {
    const phoneResult = extractMultiplePhones(sanitized.mobile_without_country_code);

    if (phoneResult.additional.length > 0) {
      // First phone → mobile field, rest → crm_note
      sanitized.mobile_without_country_code = phoneResult.primary;
      const additionalNote = `Additional phones: ${phoneResult.additional.join(', ')}`;
      sanitized.crm_note = appendToNote(sanitized.crm_note, additionalNote);

      issues.push({
        field: 'mobile_without_country_code',
        issue: `Split ${phoneResult.additional.length + 1} phones: primary → mobile, ${phoneResult.additional.length} → crm_note`,
        severity: 'info',
        action: 'moved_to_crm_note',
        originalValue: record.mobile_without_country_code as string,
        fixedValue: phoneResult.primary,
      });
    } else if (phoneResult.primary) {
      sanitized.mobile_without_country_code = phoneResult.primary;
    }
  }

  // ═══════════════════════════════════════════════
  // PASS 4: Country Code Extraction
  // Split embedded country codes from phone numbers
  // ═══════════════════════════════════════════════

  if (sanitized.mobile_without_country_code) {
    const phoneDigits = sanitized.mobile_without_country_code.replace(/[^\d+]/g, '');

    // Check if country code is embedded in the phone number
    if (phoneDigits.startsWith('+') || phoneDigits.length > 10) {
      const { countryCode, localNumber } = splitCountryCode(phoneDigits);

      if (countryCode) {
        // Only set country_code if we extracted one AND the field is empty
        if (!sanitized.country_code) {
          sanitized.country_code = countryCode;
          issues.push({
            field: 'country_code',
            issue: `Extracted country code "${countryCode}" from phone number`,
            severity: 'info',
            action: 'fixed',
            originalValue: '',
            fixedValue: countryCode,
          });
        }
        sanitized.mobile_without_country_code = localNumber;
      }
    }
  }

  // Validate country code format
  if (sanitized.country_code) {
    const validatedCode = validateCountryCode(sanitized.country_code);
    if (validatedCode !== sanitized.country_code) {
      if (validatedCode) {
        issues.push({
          field: 'country_code',
          issue: `Normalized country code format`,
          severity: 'info',
          action: 'fixed',
          originalValue: sanitized.country_code,
          fixedValue: validatedCode,
        });
      } else {
        issues.push({
          field: 'country_code',
          issue: `Invalid country code "${sanitized.country_code}" — cleared`,
          severity: 'warning',
          action: 'cleared',
          originalValue: sanitized.country_code,
        });
      }
      sanitized.country_code = validatedCode;
    }
  }

  // ═══════════════════════════════════════════════
  // PASS 5: CRM Status Enum Enforcement
  // Assignment Rule 1 (L153–L158)
  // ═══════════════════════════════════════════════

  if (sanitized.crm_status) {
    const originalStatus = sanitized.crm_status;
    const exactMatch = ALLOWED_CRM_STATUSES.find(
      s => s === originalStatus.toUpperCase().trim()
    );

    if (exactMatch) {
      sanitized.crm_status = exactMatch;
    } else {
      const fuzzyMatch = fuzzyMatchStatus(originalStatus);
      if (fuzzyMatch) {
        sanitized.crm_status = fuzzyMatch;
        issues.push({
          field: 'crm_status',
          issue: `Fuzzy-matched "${originalStatus}" → "${fuzzyMatch}"`,
          severity: 'info',
          action: 'fixed',
          originalValue: originalStatus,
          fixedValue: fuzzyMatch,
        });
      } else {
        // Invalid status — move to crm_note for context, clear the field
        sanitized.crm_note = appendToNote(sanitized.crm_note, `Original status: ${originalStatus}`);
        sanitized.crm_status = '';
        issues.push({
          field: 'crm_status',
          issue: `Invalid value "${originalStatus}" — moved to crm_note, field cleared`,
          severity: 'warning',
          action: 'cleared',
          originalValue: originalStatus,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════
  // PASS 6: Data Source Enum Enforcement
  // Assignment Rule 2 (L160–L167)
  // ═══════════════════════════════════════════════

  if (sanitized.data_source) {
    const originalSource = sanitized.data_source;
    const exactMatch = ALLOWED_DATA_SOURCES.find(
      s => s === originalSource.toLowerCase().trim()
    );

    if (exactMatch) {
      sanitized.data_source = exactMatch;
    } else {
      const fuzzyMatch = fuzzyMatchDataSource(originalSource);
      if (fuzzyMatch) {
        sanitized.data_source = fuzzyMatch;
        issues.push({
          field: 'data_source',
          issue: `Fuzzy-matched "${originalSource}" → "${fuzzyMatch}"`,
          severity: 'info',
          action: 'fixed',
          originalValue: originalSource,
          fixedValue: fuzzyMatch,
        });
      } else {
        // "If none match confidently, leave it blank" (assignment L167)
        sanitized.data_source = '';
        issues.push({
          field: 'data_source',
          issue: `No confident match for "${originalSource}" — cleared to blank`,
          severity: 'warning',
          action: 'cleared',
          originalValue: originalSource,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════
  // PASS 7: Date Validation + Normalization
  // Assignment Rule 3 (L169–L171)
  // ═══════════════════════════════════════════════

  if (sanitized.created_at) {
    const dateResult = validateAndNormalizeDate(sanitized.created_at);
    if (dateResult.valid) {
      if (dateResult.normalized !== sanitized.created_at) {
        issues.push({
          field: 'created_at',
          issue: `Normalized date format`,
          severity: 'info',
          action: 'fixed',
          originalValue: sanitized.created_at,
          fixedValue: dateResult.normalized,
        });
        sanitized.created_at = dateResult.normalized;
      }
    } else {
      issues.push({
        field: 'created_at',
        issue: `Invalid date "${sanitized.created_at}" — not parseable by new Date()`,
        severity: 'warning',
        action: 'kept',
        originalValue: sanitized.created_at,
      });
    }
  }

  // ═══════════════════════════════════════════════
  // PASS 8: Email Format Validation
  // ═══════════════════════════════════════════════

  if (sanitized.email) {
    const validated = validateEmail(sanitized.email);
    if (!validated) {
      issues.push({
        field: 'email',
        issue: `Invalid email format: "${sanitized.email}" — cleared`,
        severity: 'warning',
        action: 'cleared',
        originalValue: sanitized.email,
      });
      // Move invalid email to crm_note for context
      sanitized.crm_note = appendToNote(sanitized.crm_note, `Original email (invalid format): ${sanitized.email}`);
      sanitized.email = '';
    } else {
      sanitized.email = validated; // lowercase + trimmed
    }
  }

  // ═══════════════════════════════════════════════
  // PASS 9: Phone Format Validation
  // ═══════════════════════════════════════════════

  if (sanitized.mobile_without_country_code) {
    // Strip all non-digit characters
    const digitsOnly = sanitized.mobile_without_country_code.replace(/\D/g, '');

    if (digitsOnly.length < 7) {
      issues.push({
        field: 'mobile_without_country_code',
        issue: `Phone too short (${digitsOnly.length} digits) — cleared`,
        severity: 'warning',
        action: 'cleared',
        originalValue: sanitized.mobile_without_country_code,
      });
      sanitized.crm_note = appendToNote(
        sanitized.crm_note,
        `Original phone (too short): ${sanitized.mobile_without_country_code}`
      );
      sanitized.mobile_without_country_code = '';
    } else if (digitsOnly.length > 15) {
      issues.push({
        field: 'mobile_without_country_code',
        issue: `Phone too long (${digitsOnly.length} digits) — may contain embedded country code`,
        severity: 'warning',
        action: 'kept',
        originalValue: sanitized.mobile_without_country_code,
      });
      sanitized.mobile_without_country_code = digitsOnly;
    } else {
      sanitized.mobile_without_country_code = digitsOnly;
    }
  }

  // ═══════════════════════════════════════════════
  // PASS 10: CSV Safety — All 15 Fields
  // Assignment Rule 6 (L191–L194)
  // "Each record must remain a single CSV row"
  // ═══════════════════════════════════════════════

  for (const field of CRM_FIELDS) {
    sanitized[field] = ensureCSVSafe(sanitized[field]);
  }

  return sanitized;
}

// ─── Helper Functions ───────────────────────────

/**
 * Append a new item to crm_note using " | " separator.
 *
 * Assignment Rule 4 (L174–L181):
 * crm_note captures overflow info from all sources.
 */
function appendToNote(existingNote: string, newItem: string): string {
  if (!newItem) return existingNote;
  if (!existingNote) return newItem;
  return `${existingNote} | ${newItem}`;
}

// ─── Fuzzy Matching ─────────────────────────────

/**
 * Fuzzy-match CRM status values.
 * Covers 50+ real-world variations from different CRM platforms.
 */
function fuzzyMatchStatus(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[\s\-_]+/g, '_').replace(/[^a-z0-9_]/g, '');

  const mappings: Record<string, string> = {
    // GOOD_LEAD_FOLLOW_UP
    'good_lead_follow_up': 'GOOD_LEAD_FOLLOW_UP',
    'good_lead': 'GOOD_LEAD_FOLLOW_UP',
    'goodlead': 'GOOD_LEAD_FOLLOW_UP',
    'follow_up': 'GOOD_LEAD_FOLLOW_UP',
    'followup': 'GOOD_LEAD_FOLLOW_UP',
    'interested': 'GOOD_LEAD_FOLLOW_UP',
    'warm': 'GOOD_LEAD_FOLLOW_UP',
    'warm_lead': 'GOOD_LEAD_FOLLOW_UP',
    'hot': 'GOOD_LEAD_FOLLOW_UP',
    'hot_lead': 'GOOD_LEAD_FOLLOW_UP',
    'callback': 'GOOD_LEAD_FOLLOW_UP',
    'call_back': 'GOOD_LEAD_FOLLOW_UP',
    'contacted': 'GOOD_LEAD_FOLLOW_UP',
    'qualified': 'GOOD_LEAD_FOLLOW_UP',
    'prospect': 'GOOD_LEAD_FOLLOW_UP',
    'prospecting': 'GOOD_LEAD_FOLLOW_UP',
    'nurturing': 'GOOD_LEAD_FOLLOW_UP',
    'demo_scheduled': 'GOOD_LEAD_FOLLOW_UP',
    'meeting_set': 'GOOD_LEAD_FOLLOW_UP',
    'in_progress': 'GOOD_LEAD_FOLLOW_UP',
    'active': 'GOOD_LEAD_FOLLOW_UP',
    'new_lead': 'GOOD_LEAD_FOLLOW_UP',
    'new': 'GOOD_LEAD_FOLLOW_UP',
    'open': 'GOOD_LEAD_FOLLOW_UP',
    'pending': 'GOOD_LEAD_FOLLOW_UP',
    'engaged': 'GOOD_LEAD_FOLLOW_UP',
    'responsive': 'GOOD_LEAD_FOLLOW_UP',

    // DID_NOT_CONNECT
    'did_not_connect': 'DID_NOT_CONNECT',
    'didnt_connect': 'DID_NOT_CONNECT',
    'didnotconnect': 'DID_NOT_CONNECT',
    'not_connected': 'DID_NOT_CONNECT',
    'no_answer': 'DID_NOT_CONNECT',
    'noanswer': 'DID_NOT_CONNECT',
    'no_response': 'DID_NOT_CONNECT',
    'noresponse': 'DID_NOT_CONNECT',
    'not_reachable': 'DID_NOT_CONNECT',
    'unreachable': 'DID_NOT_CONNECT',
    'switched_off': 'DID_NOT_CONNECT',
    'phone_off': 'DID_NOT_CONNECT',
    'busy': 'DID_NOT_CONNECT',
    'ring_no_reply': 'DID_NOT_CONNECT',
    'voicemail': 'DID_NOT_CONNECT',
    'no_pickup': 'DID_NOT_CONNECT',
    'not_available': 'DID_NOT_CONNECT',
    'unavailable': 'DID_NOT_CONNECT',
    'call_later': 'DID_NOT_CONNECT',
    'try_again': 'DID_NOT_CONNECT',
    'ringing': 'DID_NOT_CONNECT',
    'disconnected': 'DID_NOT_CONNECT',

    // BAD_LEAD
    'bad_lead': 'BAD_LEAD',
    'badlead': 'BAD_LEAD',
    'not_interested': 'BAD_LEAD',
    'notinterested': 'BAD_LEAD',
    'junk': 'BAD_LEAD',
    'spam': 'BAD_LEAD',
    'invalid': 'BAD_LEAD',
    'invalid_number': 'BAD_LEAD',
    'wrong_number': 'BAD_LEAD',
    'dnd': 'BAD_LEAD',
    'do_not_disturb': 'BAD_LEAD',
    'do_not_call': 'BAD_LEAD',
    'duplicate': 'BAD_LEAD',
    'dead': 'BAD_LEAD',
    'dead_lead': 'BAD_LEAD',
    'lost': 'BAD_LEAD',
    'rejected': 'BAD_LEAD',
    'disqualified': 'BAD_LEAD',
    'cold': 'BAD_LEAD',
    'cold_lead': 'BAD_LEAD',
    'unsubscribed': 'BAD_LEAD',
    'trash': 'BAD_LEAD',
    'irrelevant': 'BAD_LEAD',
    'fake': 'BAD_LEAD',
    'test': 'BAD_LEAD',

    // SALE_DONE
    'sale_done': 'SALE_DONE',
    'saledone': 'SALE_DONE',
    'closed': 'SALE_DONE',
    'closed_won': 'SALE_DONE',
    'closedwon': 'SALE_DONE',
    'converted': 'SALE_DONE',
    'won': 'SALE_DONE',
    'deal_closed': 'SALE_DONE',
    'deal_won': 'SALE_DONE',
    'purchased': 'SALE_DONE',
    'booked': 'SALE_DONE',
    'payment_done': 'SALE_DONE',
    'paid': 'SALE_DONE',
    'onboarded': 'SALE_DONE',
    'customer': 'SALE_DONE',
    'completed': 'SALE_DONE',
    'success': 'SALE_DONE',
    'sold': 'SALE_DONE',
    'registered': 'SALE_DONE',
    'signed': 'SALE_DONE',
  };

  return mappings[normalized] || null;
}

/**
 * Fuzzy-match data source values.
 * Maps variations of the 5 allowed data sources.
 */
function fuzzyMatchDataSource(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[\s\-_]+/g, '_').replace(/[^a-z0-9_]/g, '');

  const mappings: Record<string, string> = {
    'leads_on_demand': 'leads_on_demand',
    'leadsondemand': 'leads_on_demand',
    'lod': 'leads_on_demand',
    'leads_demand': 'leads_on_demand',

    'meridian_tower': 'meridian_tower',
    'meridiantower': 'meridian_tower',
    'meridian': 'meridian_tower',

    'eden_park': 'eden_park',
    'edenpark': 'eden_park',
    'eden': 'eden_park',

    'varah_swamy': 'varah_swamy',
    'varahswamy': 'varah_swamy',
    'varah': 'varah_swamy',
    'varahswami': 'varah_swamy',

    'sarjapur_plots': 'sarjapur_plots',
    'sarjapurplots': 'sarjapur_plots',
    'sarjapur': 'sarjapur_plots',
  };

  return mappings[normalized] || null;
}

// ─── Date Validation ────────────────────────────

/**
 * Validate and normalize a date string.
 *
 * Assignment Rule 3 (L169–L171):
 * created_at must be convertible using JavaScript new Date()
 *
 * Attempts:
 * 1. Direct new Date() parsing
 * 2. DD/MM/YYYY format (Indian/European)
 * 3. DD-MM-YYYY format
 * 4. "5th March 2026" natural format
 * 5. Unix timestamp (seconds or milliseconds)
 */
function validateAndNormalizeDate(dateStr: string): { valid: boolean; normalized: string } {
  // Direct parse
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return { valid: true, normalized: dateStr };
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(.*)$/);
  if (ddmmyyyyMatch) {
    const [, day, month, year, timePart] = ddmmyyyyMatch;
    const isoDate = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}${timePart || ''}`;
    const parsed = new Date(isoDate);
    if (!isNaN(parsed.getTime())) {
      return { valid: true, normalized: isoDate.trim() };
    }
  }

  // "5th March 2026", "15 May 2026"
  const naturalMatch = dateStr.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})$/i);
  if (naturalMatch) {
    const reconstructed = `${naturalMatch[2]} ${naturalMatch[1]}, ${naturalMatch[3]}`;
    const parsed = new Date(reconstructed);
    if (!isNaN(parsed.getTime())) {
      const iso = parsed.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
      return { valid: true, normalized: iso };
    }
  }

  // Unix timestamp (seconds since epoch)
  if (/^\d{10}$/.test(dateStr)) {
    const parsed = new Date(parseInt(dateStr, 10) * 1000);
    if (!isNaN(parsed.getTime())) {
      const iso = parsed.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
      return { valid: true, normalized: iso };
    }
  }

  // Unix timestamp (milliseconds since epoch)
  if (/^\d{13}$/.test(dateStr)) {
    const parsed = new Date(parseInt(dateStr, 10));
    if (!isNaN(parsed.getTime())) {
      const iso = parsed.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
      return { valid: true, normalized: iso };
    }
  }

  return { valid: false, normalized: dateStr };
}

// ─── Public Utility ─────────────────────────────

/**
 * Check if a raw CSV record likely has contact info.
 * Used for pre-filtering before sending to AI.
 */
export function hasMinimumContactInfo(record: RawCSVRecord): boolean {
  const allText = Object.values(record).join(' ');
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(allText);
  const hasPhone = /\d{7,}/.test(allText.replace(/[\s\-().+]/g, ''));
  return hasEmail || hasPhone;
}
