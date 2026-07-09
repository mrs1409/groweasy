import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  extractMultipleEmails,
  extractMultiplePhones,
  splitCountryCode,
  ensureCSVSafe,
  validateCountryCode,
  detectDuplicates,
  escapeLineBreaks,
} from '../src/utils/validators';

// ─── Email Validation ──────────────────────────

describe('validateEmail', () => {
  it('should accept valid emails', () => {
    expect(validateEmail('test@example.com')).toBe('test@example.com');
    expect(validateEmail('user.name+tag@domain.co.in')).toBe('user.name+tag@domain.co.in');
  });

  it('should lowercase emails', () => {
    expect(validateEmail('Test@EXAMPLE.COM')).toBe('test@example.com');
  });

  it('should reject invalid emails', () => {
    expect(validateEmail('notanemail')).toBe('');
    expect(validateEmail('missing@domain')).toBe('');
    expect(validateEmail('@domain.com')).toBe('');
    expect(validateEmail('')).toBe('');
  });

  it('should trim whitespace', () => {
    expect(validateEmail('  test@example.com  ')).toBe('test@example.com');
  });
});

// ─── Multiple Email Extraction ──────────────────

describe('extractMultipleEmails', () => {
  it('should extract a single email', () => {
    const result = extractMultipleEmails('user@example.com');
    expect(result.primary).toBe('user@example.com');
    expect(result.additional).toHaveLength(0);
  });

  it('should split multiple emails', () => {
    const result = extractMultipleEmails('first@a.com, second@b.com, third@c.com');
    expect(result.primary).toBe('first@a.com');
    expect(result.additional).toEqual(['second@b.com', 'third@c.com']);
  });

  it('should deduplicate emails', () => {
    const result = extractMultipleEmails('same@test.com same@test.com');
    expect(result.primary).toBe('same@test.com');
    expect(result.additional).toHaveLength(0);
  });

  it('should return empty for no emails', () => {
    const result = extractMultipleEmails('no emails here');
    expect(result.primary).toBe('');
    expect(result.additional).toHaveLength(0);
  });
});

// ─── Multiple Phone Extraction ──────────────────

describe('extractMultiplePhones', () => {
  it('should extract a single phone number', () => {
    const result = extractMultiplePhones('9876543210');
    expect(result.primary).toBe('9876543210');
    expect(result.additional).toHaveLength(0);
  });

  it('should split multiple phone numbers', () => {
    const result = extractMultiplePhones('9876543210, 9876543211');
    expect(result.primary).toBe('9876543210');
    expect(result.additional).toEqual(['9876543211']);
  });

  it('should return empty for no phones', () => {
    const result = extractMultiplePhones('no phone');
    expect(result.primary).toBe('');
    expect(result.additional).toHaveLength(0);
  });
});

// ─── Country Code Splitting ─────────────────────

describe('splitCountryCode', () => {
  it('should split +91 Indian numbers', () => {
    const result = splitCountryCode('+919876543210');
    expect(result.countryCode).toBe('+91');
    expect(result.localNumber).toBe('9876543210');
  });

  it('should split +1 US numbers', () => {
    const result = splitCountryCode('+12125551234');
    expect(result.countryCode).toBe('+1');
    expect(result.localNumber).toBe('2125551234');
  });

  it('should handle 0091 format', () => {
    const result = splitCountryCode('00919876543210');
    expect(result.countryCode).toBe('+91');
    expect(result.localNumber).toBe('9876543210');
  });

  it('should handle plain 10-digit numbers', () => {
    const result = splitCountryCode('9876543210');
    expect(result.countryCode).toBe('');
    expect(result.localNumber).toBe('9876543210');
  });

  it('should handle 91 prefix (12 digits)', () => {
    const result = splitCountryCode('919876543210');
    expect(result.countryCode).toBe('+91');
    expect(result.localNumber).toBe('9876543210');
  });
});

// ─── CSV Safety ─────────────────────────────────

describe('ensureCSVSafe', () => {
  it('should escape line breaks', () => {
    expect(ensureCSVSafe('line1\nline2')).toBe('line1 | line2');
    expect(ensureCSVSafe('line1\r\nline2')).toBe('line1 | line2');
  });

  it('should handle null/N/A strings', () => {
    expect(ensureCSVSafe('null')).toBe('');
    expect(ensureCSVSafe('N/A')).toBe('');
    expect(ensureCSVSafe('undefined')).toBe('');
    expect(ensureCSVSafe('not available')).toBe('');
    expect(ensureCSVSafe('none')).toBe('');
    expect(ensureCSVSafe('-')).toBe('');
    expect(ensureCSVSafe('--')).toBe('');
  });

  it('should collapse multiple spaces', () => {
    expect(ensureCSVSafe('too   many   spaces')).toBe('too many spaces');
  });

  it('should trim whitespace', () => {
    expect(ensureCSVSafe('  padded  ')).toBe('padded');
  });

  it('should return empty string for empty input', () => {
    expect(ensureCSVSafe('')).toBe('');
  });
});

describe('escapeLineBreaks', () => {
  it('should escape \\n', () => {
    expect(escapeLineBreaks('a\nb')).toBe('a | b');
  });
  it('should escape \\r\\n', () => {
    expect(escapeLineBreaks('a\r\nb')).toBe('a | b');
  });
  it('should handle empty string', () => {
    expect(escapeLineBreaks('')).toBe('');
  });
});

// ─── Country Code Validation ────────────────────

describe('validateCountryCode', () => {
  it('should accept valid country codes', () => {
    expect(validateCountryCode('+91')).toBe('+91');
    expect(validateCountryCode('+1')).toBe('+1');
    expect(validateCountryCode('+44')).toBe('+44');
  });

  it('should add + prefix if missing', () => {
    expect(validateCountryCode('91')).toBe('+91');
    expect(validateCountryCode('1')).toBe('+1');
  });

  it('should strip formatting', () => {
    expect(validateCountryCode(' +91 ')).toBe('+91');
    expect(validateCountryCode('+9-1')).toBe('+91');
  });

  it('should reject invalid codes', () => {
    expect(validateCountryCode('abcde')).toBe('');
    expect(validateCountryCode('+123456')).toBe('');
  });

  it('should return empty for empty input', () => {
    expect(validateCountryCode('')).toBe('');
  });
});

// ─── Duplicate Detection ────────────────────────

describe('detectDuplicates', () => {
  it('should detect email duplicates', () => {
    const records = [
      { email: 'a@test.com', mobile_without_country_code: '1111111' },
      { email: 'b@test.com', mobile_without_country_code: '2222222' },
      { email: 'a@test.com', mobile_without_country_code: '3333333' },
    ];
    const { uniqueIndices, duplicateMap } = detectDuplicates(records);
    expect(uniqueIndices.size).toBe(2);
    expect(duplicateMap.has(2)).toBe(true);
    expect(duplicateMap.get(2)?.duplicateOf).toBe(0);
  });

  it('should detect phone duplicates', () => {
    const records = [
      { email: 'a@test.com', mobile_without_country_code: '9876543210' },
      { email: 'b@test.com', mobile_without_country_code: '9876543210' },
    ];
    const { duplicateMap } = detectDuplicates(records);
    expect(duplicateMap.has(1)).toBe(true);
  });

  it('should keep all unique records', () => {
    const records = [
      { email: 'a@test.com', mobile_without_country_code: '1111111' },
      { email: 'b@test.com', mobile_without_country_code: '2222222' },
    ];
    const { uniqueIndices, duplicateMap } = detectDuplicates(records);
    expect(uniqueIndices.size).toBe(2);
    expect(duplicateMap.size).toBe(0);
  });

  it('should handle empty records', () => {
    const { uniqueIndices, duplicateMap } = detectDuplicates([]);
    expect(uniqueIndices.size).toBe(0);
    expect(duplicateMap.size).toBe(0);
  });
});
