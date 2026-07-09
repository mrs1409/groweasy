// ============================================
// GrowEasy CSV Importer — Output Repair Service
// ============================================
//
// This module repairs common AI output issues that
// would otherwise cause parse failures or data loss.
//
// DESIGN DECISIONS:
//
// 1. REPAIR BEFORE REJECT: LLM responses are expensive
//    ($$ and time). Rather than retrying on malformed
//    output, we attempt repair first. A retry costs
//    another API call; repair costs ~1ms of regex.
//
// 2. PROGRESSIVE REPAIR: We apply repairs from simplest
//    to most complex: markdown stripping → JSON extraction
//    → trailing comma fix → truncation repair → bracket
//    balancing. Each stage is independent.
//
// 3. STRUCTURAL RECOVERY: If the AI returns an array of
//    records instead of the expected {records, skipped}
//    wrapper, we auto-wrap it. This handles a very common
//    LLM behavior where it "forgets" the outer structure.
//
// 4. FIELD REPAIR: If the AI omits some of the 15 required
//    fields from a record, we fill them with "" rather than
//    rejecting the entire record. Partial data > no data.
//
// ============================================

import { AIBatchResponse, CRMRecord } from '../types';
import { CRM_FIELDS } from '../constants';
import { logger } from '../utils/logger';

/**
 * Attempt to repair a raw AI response string into valid,
 * parseable JSON conforming to the AIBatchResponse schema.
 *
 * This is called when the primary JSON.parse fails.
 * It applies a series of progressive repairs to recover
 * as much data as possible.
 *
 * @param rawText - The raw text response from the AI
 * @returns Repaired AIBatchResponse or null if repair is impossible
 */
export function repairAIResponse(rawText: string): AIBatchResponse | null {
  logger.debug('Attempting output repair on AI response', {
    responseLength: rawText.length,
  });

  let text = rawText.trim();
  let repairsApplied: string[] = [];

  // ─── Stage 1: Strip Markdown Wrapping ──────────
  // AI sometimes wraps JSON in ```json ... ``` blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
    repairsApplied.push('stripped_markdown_code_block');
  }

  // ─── Stage 2: Remove Leading/Trailing Text ─────
  // AI sometimes adds explanatory text before/after JSON
  if (!text.startsWith('{') && !text.startsWith('[')) {
    const jsonStart = text.search(/[{\[]/);
    if (jsonStart === -1) {
      logger.warn('Output repair failed: no JSON structure found');
      return null;
    }
    text = text.substring(jsonStart);
    repairsApplied.push('stripped_leading_text');
  }

  // Remove trailing text after the JSON
  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  const lastJsonChar = Math.max(lastBrace, lastBracket);
  if (lastJsonChar !== -1 && lastJsonChar < text.length - 1) {
    text = text.substring(0, lastJsonChar + 1);
    repairsApplied.push('stripped_trailing_text');
  }

  // ─── Stage 3: Fix Trailing Commas ──────────────
  // AI sometimes adds trailing commas in arrays/objects
  // which is invalid JSON
  const beforeTrailingCommaFix = text;
  text = text.replace(/,\s*([\]}])/g, '$1');
  if (text !== beforeTrailingCommaFix) {
    repairsApplied.push('fixed_trailing_commas');
  }

  // ─── Stage 4: Fix Single Quotes ────────────────
  // Some models use single quotes instead of double quotes
  // Only fix if the entire response uses single quotes consistently
  if (text.includes("'") && !text.includes('"')) {
    text = text.replace(/'/g, '"');
    repairsApplied.push('replaced_single_quotes');
  }

  // ─── Stage 5: Fix Unescaped Newlines in Strings ─
  // Replace actual newlines inside string values with \\n
  text = text.replace(/"([^"]*)\n([^"]*?)"/g, (_match, p1: string, p2: string) => {
    repairsApplied.push('escaped_newlines_in_strings');
    return `"${p1}\\n${p2}"`;
  });

  // ─── Stage 6: Attempt Parse ────────────────────
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // ─── Stage 7: Try Bracket Balancing ────────
    // If truncated, try to close open brackets/braces
    const balanced = balanceBrackets(text);
    if (balanced !== text) {
      repairsApplied.push('balanced_brackets');
      try {
        parsed = JSON.parse(balanced);
        text = balanced;
      } catch {
        logger.warn('Output repair failed: JSON still invalid after all repairs', {
          repairsApplied,
          textPreview: text.substring(0, 300),
        });
        return null;
      }
    } else {
      logger.warn('Output repair failed: could not parse JSON', {
        repairsApplied,
        textPreview: text.substring(0, 300),
      });
      return null;
    }
  }

  // ─── Stage 8: Structural Recovery ──────────────
  // Wrap into expected {records, skipped} format if needed
  const result = normalizeToAIBatchResponse(parsed, repairsApplied);

  if (result) {
    logger.info('Output repair succeeded', {
      repairsApplied,
      recordCount: result.records.length,
      skippedCount: result.skipped.length,
    });
  }

  return result;
}

/**
 * Normalize any parsed JSON structure into AIBatchResponse format.
 *
 * Handles these common AI output variations:
 * 1. Correct format: {records: [...], skipped: [...]}
 * 2. Array of records: [{...}, {...}] (missing wrapper)
 * 3. Single record: {...} (forgot array)
 * 4. Nested: {data: {records: [...]}} (extra nesting)
 * 5. Alternative keys: {extracted: [...], invalid: [...]}
 */
function normalizeToAIBatchResponse(
  parsed: unknown,
  repairsApplied: string[]
): AIBatchResponse | null {
  // Case 1: Already correct format
  if (isAIBatchResponse(parsed)) {
    return {
      records: ensureRecordFields(parsed.records),
      skipped: Array.isArray(parsed.skipped) ? parsed.skipped as AIBatchResponse['skipped'] : [],
    };
  }

  // Case 2: Array of records (AI forgot the wrapper)
  if (Array.isArray(parsed)) {
    repairsApplied.push('wrapped_array_in_response_object');
    return {
      records: ensureRecordFields(parsed as Partial<CRMRecord>[]),
      skipped: [],
    };
  }

  // Case 3: Single record object (AI forgot both array and wrapper)
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;

    // Check for alternative wrapper keys
    const recordsKey = findKey(obj, ['records', 'extracted', 'data', 'results', 'leads', 'output']);
    const skippedKey = findKey(obj, ['skipped', 'invalid', 'errors', 'failed', 'rejected']);

    if (recordsKey) {
      const records = Array.isArray(obj[recordsKey]) ? obj[recordsKey] as Partial<CRMRecord>[] : [];
      const skipped = skippedKey && Array.isArray(obj[skippedKey]) ? obj[skippedKey] : [];
      repairsApplied.push(`mapped_alternative_keys:${recordsKey}/${skippedKey || 'none'}`);
      return {
        records: ensureRecordFields(records),
        skipped: skipped as AIBatchResponse['skipped'],
      };
    }

    // Maybe it's a single record?
    if ('email' in obj || 'name' in obj || 'mobile_without_country_code' in obj) {
      repairsApplied.push('wrapped_single_record');
      return {
        records: ensureRecordFields([obj as Partial<CRMRecord>]),
        skipped: [],
      };
    }
  }

  logger.warn('Could not normalize parsed JSON to AIBatchResponse', {
    type: typeof parsed,
    isArray: Array.isArray(parsed),
  });
  return null;
}

/**
 * Check if a parsed object looks like an AIBatchResponse.
 */
function isAIBatchResponse(obj: unknown): obj is { records: Partial<CRMRecord>[]; skipped: unknown[] } {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  const typed = obj as Record<string, unknown>;
  return 'records' in typed && Array.isArray(typed.records);
}

/**
 * Find the first matching key in an object from a list of candidates.
 */
function findKey(obj: Record<string, unknown>, candidates: string[]): string | undefined {
  const objKeys = Object.keys(obj).map(k => k.toLowerCase());
  for (const candidate of candidates) {
    const idx = objKeys.indexOf(candidate.toLowerCase());
    if (idx !== -1) {
      return Object.keys(obj)[idx];
    }
  }
  return undefined;
}

/**
 * Ensure every record has all 15 CRM fields.
 * Fill missing fields with empty strings rather than
 * rejecting the entire record.
 *
 * DESIGN DECISION: Partial data is better than no data.
 * If the AI extracted 12 of 15 fields correctly, we keep
 * those 12 and fill the missing 3 with "".
 */
function ensureRecordFields(records: Partial<CRMRecord>[]): CRMRecord[] {
  return records.map(record => {
    const complete: Record<string, string> = {};
    for (const field of CRM_FIELDS) {
      const value = (record as Record<string, unknown>)[field];
      complete[field] = value !== undefined && value !== null ? String(value) : '';
    }
    return complete as unknown as CRMRecord;
  });
}

/**
 * Attempt to balance unclosed brackets and braces in truncated JSON.
 *
 * This handles the case where the AI response was truncated
 * due to token limits, leaving unclosed JSON structures.
 *
 * Strategy: Count opens vs closes for both {} and [],
 * then append the missing closing characters.
 */
function balanceBrackets(text: string): string {
  let braceCount = 0;  // {}
  let bracketCount = 0;  // []
  let inString = false;
  let escapeNext = false;

  for (const char of text) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    switch (char) {
      case '{': braceCount++; break;
      case '}': braceCount--; break;
      case '[': bracketCount++; break;
      case ']': bracketCount--; break;
    }
  }

  // Append missing closers
  let result = text;

  // If we're inside an unclosed string, close it
  if (inString) {
    result += '"';
  }

  // Close arrays and objects
  for (let i = 0; i < bracketCount; i++) result += ']';
  for (let i = 0; i < braceCount; i++) result += '}';

  return result;
}

/**
 * Validate that a CRM record contains at least the minimum
 * useful information (not just empty strings).
 *
 * Returns a confidence score from 0.0 to 1.0 indicating
 * how many fields were successfully extracted.
 */
export function calculateExtractionConfidence(record: CRMRecord): number {
  let filledFields = 0;
  const totalFields = CRM_FIELDS.length; // 15

  for (const field of CRM_FIELDS) {
    if (record[field] && record[field].trim() !== '') {
      filledFields++;
    }
  }

  return filledFields / totalFields;
}

/**
 * Check if a record appears to be a hallucination.
 *
 * A hallucinated record typically has:
 * - Email addresses that look auto-generated (test@test.com patterns)
 * - Phone numbers that are too perfect (1234567890)
 * - Names that are clearly placeholder-like
 *
 * This is a heuristic check — it's conservative to avoid
 * false positives (rejecting real data).
 */
export function detectHallucination(
  record: CRMRecord,
  originalData: Record<string, string>
): boolean {
  const originalValues = Object.values(originalData).join(' ').toLowerCase();

  // Check if the extracted email exists somewhere in the original data
  if (record.email && record.email.trim() !== '') {
    const emailLocal = record.email.split('@')[0].toLowerCase();
    // If the email's local part doesn't appear anywhere in the original data,
    // it might be hallucinated
    if (!originalValues.includes(emailLocal) && !originalValues.includes(record.email.toLowerCase())) {
      logger.warn('Potential hallucinated email detected', {
        email: record.email,
        reason: 'Email not found in original data',
      });
      return true;
    }
  }

  // Check if phone number exists in original data
  if (record.mobile_without_country_code && record.mobile_without_country_code.trim() !== '') {
    const phone = record.mobile_without_country_code.replace(/\D/g, '');
    if (phone.length >= 7 && !originalValues.replace(/\D/g, '').includes(phone)) {
      logger.warn('Potential hallucinated phone detected', {
        phone: record.mobile_without_country_code,
        reason: 'Phone number not found in original data',
      });
      return true;
    }
  }

  return false;
}
