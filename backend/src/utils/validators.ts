// ============================================
// GrowEasy CSV Importer — Field-Level Validators
// ============================================
//
// Pure validation and correction functions for
// individual CRM fields. Each function takes a
// raw value and returns a validated/corrected value.
//
// These are used by the validation service as
// building blocks for the multi-pass pipeline.
//
// ASSIGNMENT RULE COVERAGE:
// Rule 1: CRM Status enum        → validateCRMStatus()
// Rule 2: Data Source enum        → validateDataSource()
// Rule 3: Date format             → validateDate()
// Rule 4: CRM Notes overflow      → (handled in validation service)
// Rule 5: Multiple emails         → extractMultipleEmails()
// Rule 6: Multiple phones         → extractMultiplePhones()
// Rule 7: Skip invalid records    → (handled in validation service)
// Rule 8: CSV row compatibility   → ensureCSVSafe()
// Rule 9: Escaped line breaks     → escapeLineBreaks()
//
// ============================================

import { logger } from './logger';

// ─── Email Validation ──────────────────────────

/** Regex pattern for basic email validation */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Regex to find all email addresses in a string */
const EMAIL_EXTRACT_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Validate and normalize an email address.
 *
 * @returns Normalized email or empty string if invalid
 */
export function validateEmail(email: string): string {
  if (!email) return '';

  const cleaned = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(cleaned)) {
    return '';
  }

  return cleaned;
}

/**
 * Extract all email addresses from a string value.
 *
 * Assignment Rule 5 (L184–L186):
 * - First email → primary email field
 * - Remaining emails → append to crm_note
 *
 * This catches cases where the AI put multiple emails
 * into a single field instead of splitting them.
 *
 * @returns Object with primary email and additional emails array
 */
export function extractMultipleEmails(value: string): {
  primary: string;
  additional: string[];
} {
  if (!value) return { primary: '', additional: [] };

  const matches = value.match(EMAIL_EXTRACT_REGEX);
  if (!matches || matches.length === 0) {
    return { primary: '', additional: [] };
  }

  // Deduplicate while preserving order
  const unique = [...new Set(matches.map(e => e.toLowerCase()))];

  return {
    primary: unique[0],
    additional: unique.slice(1),
  };
}

// ─── Phone Validation ──────────────────────────

/** 
 * Regex patterns for common phone number formats.
 * Matches numbers with at least 7 digits (international minimum).
 */
const PHONE_EXTRACT_REGEX = /(?:\+?\d{1,4}[\s\-.]?)?\(?\d{1,4}\)?[\s\-.]?\d{2,5}[\s\-.]?\d{2,5}/g;

/**
 * Extract and normalize a phone number.
 *
 * Strips formatting characters (spaces, dashes, parentheses)
 * and returns just the digits.
 *
 * @returns Normalized phone number (digits only) or empty string
 */
export function validatePhone(phone: string): string {
  if (!phone) return '';

  // Strip all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Must have at least 7 digits to be a valid phone number
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 7) {
    return '';
  }

  return cleaned;
}

/**
 * Extract multiple phone numbers from a string value.
 *
 * Assignment Rule 6 (L187–L189):
 * - First mobile → primary mobile field
 * - Remaining mobiles → append to crm_note
 *
 * This catches cases where the AI put multiple phones
 * into a single field instead of splitting them.
 *
 * @returns Object with primary phone and additional phones array
 */
export function extractMultiplePhones(value: string): {
  primary: string;
  additional: string[];
} {
  if (!value) return { primary: '', additional: [] };

  const matches = value.match(PHONE_EXTRACT_REGEX);
  if (!matches || matches.length === 0) {
    // Fallback: just extract digit sequences
    const digitSeqs = value.match(/\d{7,15}/g);
    if (!digitSeqs) return { primary: '', additional: [] };
    return {
      primary: digitSeqs[0],
      additional: digitSeqs.slice(1),
    };
  }

  // Clean each match to digits only and deduplicate
  const cleaned = matches
    .map(m => m.replace(/\D/g, ''))
    .filter(m => m.length >= 7);

  const unique = [...new Set(cleaned)];

  return {
    primary: unique[0] || '',
    additional: unique.slice(1),
  };
}

/**
 * Split a phone number into country code and local number.
 *
 * Assignment Rule 7 (L84–L88 of architecture):
 * - "+919876543210" → { countryCode: "+91", local: "9876543210" }
 * - "9876543210" → { countryCode: "", local: "9876543210" }
 *
 * Handles common Indian formats:
 * - +91XXXXXXXXXX (13 chars)
 * - 0091XXXXXXXXXX
 * - 91XXXXXXXXXX (12 digits, starts with 91)
 */
export function splitCountryCode(phone: string): {
  countryCode: string;
  localNumber: string;
} {
  if (!phone) return { countryCode: '', localNumber: '' };

  let digits = phone.replace(/[^\d+]/g, '');

  // Handle +CC format
  if (digits.startsWith('+')) {
    // +91XXXXXXXXXX — most common for India
    if (digits.startsWith('+91') && digits.length === 13) {
      return { countryCode: '+91', localNumber: digits.slice(3) };
    }
    // +1XXXXXXXXXX — US/Canada
    if (digits.startsWith('+1') && digits.length === 12) {
      return { countryCode: '+1', localNumber: digits.slice(2) };
    }
    // +44XXXXXXXXXX — UK
    if (digits.startsWith('+44') && digits.length >= 12) {
      return { countryCode: '+44', localNumber: digits.slice(3) };
    }
    // Generic: assume first 2-4 chars after + are country code
    // if total length > 10
    if (digits.length > 11) {
      const localLength = 10;
      const codeLength = digits.length - 1 - localLength; // -1 for the +
      if (codeLength >= 1 && codeLength <= 4) {
        return {
          countryCode: '+' + digits.slice(1, 1 + codeLength),
          localNumber: digits.slice(1 + codeLength),
        };
      }
    }
    // Can't determine code — keep as-is
    return { countryCode: '', localNumber: digits.replace('+', '') };
  }

  // Handle 0091XXXXXXXXXX format
  if (digits.startsWith('0091') && digits.length >= 14) {
    return { countryCode: '+91', localNumber: digits.slice(4) };
  }

  // Handle 91XXXXXXXXXX format (12 digits starting with 91)
  if (digits.startsWith('91') && digits.length === 12) {
    return { countryCode: '+91', localNumber: digits.slice(2) };
  }

  // No country code detected
  return { countryCode: '', localNumber: digits };
}

// ─── Line Break & CSV Safety ───────────────────

/**
 * Escape line breaks in a string value.
 *
 * Assignment Rule 6 (L191–L194):
 * "Each record must remain a single CSV row."
 * "If line breaks are necessary, escape them appropriately."
 *
 * We use " | " as the separator (readable alternative to \n)
 * for display purposes, maintaining CSV safety.
 */
export function escapeLineBreaks(value: string): string {
  if (!value) return '';

  return value
    .replace(/\r\n/g, ' | ')
    .replace(/\r/g, ' | ')
    .replace(/\n/g, ' | ');
}

/**
 * Ensure a string value is safe for CSV output.
 *
 * Assignment Rule 6 (L191–L194):
 * "Each record must remain a single CSV row."
 *
 * This function:
 * 1. Escapes line breaks
 * 2. Trims whitespace
 * 3. Collapses multiple spaces
 * 4. Handles literal "null"/"N/A" strings
 *
 * @returns CSV-safe string value
 */
export function ensureCSVSafe(value: string): string {
  if (!value) return '';

  let cleaned = value.trim();

  // Handle AI returning literal "null", "undefined", "N/A", etc.
  const lowerCleaned = cleaned.toLowerCase();
  if ([
    'null', 'undefined', 'n/a', 'none', 'na',
    '-', '--', '---',
    'not available', 'not provided', 'not applicable',
    'empty', 'blank', 'nil',
  ].includes(lowerCleaned)) {
    return '';
  }

  // Escape line breaks
  cleaned = escapeLineBreaks(cleaned);

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  return cleaned;
}

// ─── Duplicate Detection ───────────────────────

/**
 * Result of duplicate detection across a set of records.
 */
export interface DuplicateCheckResult {
  /** Unique records (first occurrence kept) */
  unique: { record: Record<string, string>; originalIndex: number }[];
  /** Duplicate records with the index they duplicate */
  duplicates: { record: Record<string, string>; originalIndex: number; duplicateOf: number; reason: string }[];
}

/**
 * Detect duplicate records based on email and phone number.
 *
 * A record is considered a duplicate if it shares the same
 * email OR the same phone number with an earlier record.
 *
 * The FIRST occurrence is kept; subsequent duplicates are flagged.
 *
 * @param records - Array of records with at least email and mobile fields
 * @returns DuplicateCheckResult with unique and duplicate arrays
 */
export function detectDuplicates<T extends { email?: string; mobile_without_country_code?: string }>(
  records: T[]
): { uniqueIndices: Set<number>; duplicateMap: Map<number, { duplicateOf: number; reason: string }> } {
  const emailSeen = new Map<string, number>(); // email → first seen index
  const phoneSeen = new Map<string, number>(); // phone → first seen index
  const duplicateMap = new Map<number, { duplicateOf: number; reason: string }>();
  const uniqueIndices = new Set<number>();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const email = (record.email || '').toLowerCase().trim();
    const phone = (record.mobile_without_country_code || '').replace(/\D/g, '').trim();

    let isDuplicate = false;

    // Check email duplicate
    if (email && emailSeen.has(email)) {
      const firstIndex = emailSeen.get(email)!;
      duplicateMap.set(i, {
        duplicateOf: firstIndex,
        reason: `Duplicate email "${email}" (same as row ${firstIndex})`,
      });
      isDuplicate = true;
      logger.debug(`Duplicate detected: row ${i} has same email as row ${firstIndex}`, { email });
    }

    // Check phone duplicate (only if not already flagged by email)
    if (!isDuplicate && phone && phone.length >= 7 && phoneSeen.has(phone)) {
      const firstIndex = phoneSeen.get(phone)!;
      duplicateMap.set(i, {
        duplicateOf: firstIndex,
        reason: `Duplicate phone "${phone}" (same as row ${firstIndex})`,
      });
      isDuplicate = true;
      logger.debug(`Duplicate detected: row ${i} has same phone as row ${firstIndex}`, { phone });
    }

    if (!isDuplicate) {
      uniqueIndices.add(i);
      // Record first occurrence
      if (email) emailSeen.set(email, i);
      if (phone && phone.length >= 7) phoneSeen.set(phone, i);
    }
  }

  if (duplicateMap.size > 0) {
    logger.info(`Duplicate detection: ${duplicateMap.size} duplicates found in ${records.length} records`);
  }

  return { uniqueIndices, duplicateMap };
}

// ─── Country Code Validation ───────────────────

/**
 * Known country dial codes for validation.
 * Not exhaustive — covers the most common ones.
 */
const KNOWN_COUNTRY_CODES = new Set([
  '+1', '+7', '+20', '+27', '+30', '+31', '+32', '+33', '+34', '+36',
  '+39', '+40', '+41', '+43', '+44', '+45', '+46', '+47', '+48', '+49',
  '+51', '+52', '+53', '+54', '+55', '+56', '+57', '+58', '+60', '+61',
  '+62', '+63', '+64', '+65', '+66', '+81', '+82', '+84', '+86', '+90',
  '+91', '+92', '+93', '+94', '+95', '+98', '+211', '+212', '+213',
  '+216', '+218', '+220', '+221', '+222', '+223', '+224', '+225',
  '+226', '+227', '+228', '+229', '+230', '+231', '+232', '+233',
  '+234', '+235', '+236', '+237', '+238', '+239', '+240', '+241',
  '+242', '+243', '+244', '+245', '+246', '+247', '+248', '+249',
  '+250', '+251', '+252', '+253', '+254', '+255', '+256', '+257',
  '+258', '+260', '+261', '+262', '+263', '+264', '+265', '+266',
  '+267', '+268', '+269', '+290', '+291', '+297', '+298', '+299',
  '+350', '+351', '+352', '+353', '+354', '+355', '+356', '+357',
  '+358', '+359', '+370', '+371', '+372', '+373', '+374', '+375',
  '+376', '+377', '+378', '+380', '+381', '+382', '+383', '+385',
  '+386', '+387', '+389', '+420', '+421', '+423', '+500', '+501',
  '+502', '+503', '+504', '+505', '+506', '+507', '+508', '+509',
  '+590', '+591', '+592', '+593', '+594', '+595', '+596', '+597',
  '+598', '+599', '+670', '+672', '+673', '+674', '+675', '+676',
  '+677', '+678', '+679', '+680', '+681', '+682', '+683', '+685',
  '+686', '+687', '+688', '+689', '+690', '+691', '+692', '+850',
  '+852', '+853', '+855', '+856', '+880', '+886', '+960', '+961',
  '+962', '+963', '+964', '+965', '+966', '+967', '+968', '+970',
  '+971', '+972', '+973', '+974', '+975', '+976', '+977', '+992',
  '+993', '+994', '+995', '+996', '+998',
]);

/**
 * Validate a country code format.
 *
 * @returns The validated country code with '+' prefix, or empty string
 */
export function validateCountryCode(code: string): string {
  if (!code) return '';

  // Clean formatting
  let cleaned = code.replace(/[\s\-().]/g, '');

  // Ensure + prefix
  if (cleaned && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  // Check if it's a known code (optional — we don't reject unknown codes)
  if (cleaned && !KNOWN_COUNTRY_CODES.has(cleaned)) {
    logger.debug(`Country code "${cleaned}" not in known codes list — keeping anyway`);
  }

  // Must be + followed by 1-4 digits
  if (!/^\+\d{1,4}$/.test(cleaned)) {
    return '';
  }

  return cleaned;
}
