// ============================================
// GrowEasy CSV Importer — Heuristic Extractor
// ============================================
//
// Pure client/server fallback matcher that performs
// smart semantic matching without an LLM when the API
// is rate-limited, keyless, or blocked.
//
// This replicates the mapping instructions of the AI:
// - Finds name, email, phone, city, state, country, company
// - Separates country code from phone
// - Collects unmapped fields into crm_note
// - Extracts status and data source via fuzzy matching
// - Normalizes dates
//
// ============================================

import { CRMRecord, RawCSVRecord } from '../types';
// No imports needed from constants
import {
  extractMultipleEmails,
  extractMultiplePhones,
  splitCountryCode,
  ensureCSVSafe,
  validateCountryCode,
} from './validators';

/**
 * Heuristic mapping config. Match headers semantically.
 */
const FIELD_ALIASES: Record<keyof CRMRecord, string[]> = {
  name: ['name', 'full name', 'lead name', 'client', 'customer', 'first name', 'last name', 'contact name', 'nombre'],
  email: ['email', 'email address', 'e-mail', 'mail', 'email id', 'contacto email', 'correo'],
  mobile_without_country_code: ['phone', 'mobile', 'cell', 'contact', 'telephone', 'phone number', 'mobil', 'tel', 'telefon', 'mobilfunk'],
  country_code: ['country code', 'code', 'prefix', 'dial code'],
  company: ['company', 'organization', 'org', 'firm', 'business', 'employer', 'company name'],
  city: ['city', 'town', 'location', 'stadt', 'ciudad'],
  state: ['state', 'province', 'region', 'bundesland', 'estado'],
  country: ['country', 'nation', 'land', 'pais'],
  lead_owner: ['owner', 'lead owner', 'assigned to', 'agent', 'sales rep', 'representative', 'manager'],
  crm_status: ['status', 'lead status', 'crm status', 'stage', 'phase'],
  data_source: ['source', 'data source', 'campaign', 'channel', 'utm_source', 'medium'],
  possession_time: ['possession', 'possession time', 'timeframe', 'move in', 'ready in'],
  description: ['description', 'about', 'details', 'info', 'summary'],
  created_at: ['created', 'created at', 'created time', 'date', 'import date', 'timestamp'],
  crm_note: ['notes', 'note', 'remarks', 'remark', 'comments', 'comment'],
};

/**
 * Perform local semantic heuristic extraction on a CSV row.
 */
export function extractRowHeuristically(row: RawCSVRecord): CRMRecord {
  const record: CRMRecord = {
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

  const matchedHeaders = new Set<string>();

  // Helper to find column matching aliases
  const findValue = (field: keyof CRMRecord): { value: string; headerMatched: string | null } => {
    const aliases = FIELD_ALIASES[field];
    for (const key of Object.keys(row)) {
      const normalizedKey = key.toLowerCase().trim();
      if (aliases.includes(normalizedKey)) {
        return { value: (row[key] || '').trim(), headerMatched: key };
      }
    }
    // Substring fallback if exact key alias not found
    for (const key of Object.keys(row)) {
      const normalizedKey = key.toLowerCase().trim();
      for (const alias of aliases) {
        if (normalizedKey.includes(alias) && alias.length > 3) {
          return { value: (row[key] || '').trim(), headerMatched: key };
        }
      }
    }
    return { value: '', headerMatched: null };
  };

  // ─── Extract Standard Fields ────────────────
  const standardFields: (keyof CRMRecord)[] = [
    'name', 'company', 'city', 'state', 'country',
    'lead_owner', 'possession_time', 'description', 'created_at'
  ];

  for (const field of standardFields) {
    const { value, headerMatched } = findValue(field);
    record[field] = value;
    if (headerMatched) matchedHeaders.add(headerMatched);
  }

  // ─── Contact Info (Emails) ──────────────────
  const emailFind = findValue('email');
  if (emailFind.headerMatched) matchedHeaders.add(emailFind.headerMatched);
  const emailValue = emailFind.value;
  if (emailValue) {
    const emailResult = extractMultipleEmails(emailValue);
    record.email = emailResult.primary;
    if (emailResult.additional.length > 0) {
      record.crm_note = `Additional emails: ${emailResult.additional.join(', ')}`;
    }
  }

  // ─── Contact Info (Phones) ──────────────────
  const phoneFind = findValue('mobile_without_country_code');
  if (phoneFind.headerMatched) matchedHeaders.add(phoneFind.headerMatched);
  const phoneValue = phoneFind.value;
  if (phoneValue) {
    const phoneResult = extractMultiplePhones(phoneValue);
    const primaryPhone = phoneResult.primary;
    
    // Country code extraction
    const { countryCode, localNumber } = splitCountryCode(primaryPhone);
    record.mobile_without_country_code = localNumber;
    record.country_code = countryCode;

    // Check if country code field is present in csv
    const countryCodeFind = findValue('country_code');
    if (countryCodeFind.value) {
      record.country_code = validateCountryCode(countryCodeFind.value);
      if (countryCodeFind.headerMatched) matchedHeaders.add(countryCodeFind.headerMatched);
    }

    if (phoneResult.additional.length > 0) {
      const addPhones = `Additional phones: ${phoneResult.additional.join(', ')}`;
      record.crm_note = record.crm_note ? `${record.crm_note} | ${addPhones}` : addPhones;
    }
  }

  // ─── CRM Status ─────────────────────────────
  const statusFind = findValue('crm_status');
  if (statusFind.headerMatched) matchedHeaders.add(statusFind.headerMatched);
  if (statusFind.value) {
    record.crm_status = statusFind.value;
  } else {
    // Look at description or comments to guess status
    const remarkFind = findValue('crm_note');
    const descFind = findValue('description');
    const textToSearch = `${remarkFind.value} ${descFind.value}`.toLowerCase();
    if (textToSearch.includes('interested') || textToSearch.includes('follow up') || textToSearch.includes('warm') || textToSearch.includes('hot')) {
      record.crm_status = 'GOOD_LEAD_FOLLOW_UP';
    } else if (textToSearch.includes('busy') || textToSearch.includes('switched off') || textToSearch.includes('no answer')) {
      record.crm_status = 'DID_NOT_CONNECT';
    } else if (textToSearch.includes('not interested') || textToSearch.includes('spam') || textToSearch.includes('fake')) {
      record.crm_status = 'BAD_LEAD';
    } else if (textToSearch.includes('closed') || textToSearch.includes('won') || textToSearch.includes('paid')) {
      record.crm_status = 'SALE_DONE';
    } else {
      record.crm_status = 'GOOD_LEAD_FOLLOW_UP'; // default fallback
    }
  }

  // ─── Data Source ────────────────────────────
  const sourceFind = findValue('data_source');
  if (sourceFind.headerMatched) matchedHeaders.add(sourceFind.headerMatched);
  record.data_source = sourceFind.value;

  // ─── Notes / Unmapped Field Aggregation ──────
  const remarkFind = findValue('crm_note');
  if (remarkFind.headerMatched) matchedHeaders.add(remarkFind.headerMatched);
  if (remarkFind.value) {
    record.crm_note = record.crm_note ? `${record.crm_note} | ${remarkFind.value}` : remarkFind.value;
  }

  // Aggregate ALL unmapped fields into note so no data is lost
  const unmappedInfos: string[] = [];
  for (const key of Object.keys(row)) {
    if (!matchedHeaders.has(key)) {
      const val = (row[key] || '').trim();
      if (val) {
        unmappedInfos.push(`${key}: ${val}`);
      }
    }
  }

  if (unmappedInfos.length > 0) {
    const unmappedStr = unmappedInfos.join(' | ');
    record.crm_note = record.crm_note ? `${record.crm_note} | ${unmappedStr}` : unmappedStr;
  }

  // Final cleanup/sanitization
  for (const key of Object.keys(record) as (keyof CRMRecord)[]) {
    record[key] = ensureCSVSafe(record[key]);
  }

  return record;
}
