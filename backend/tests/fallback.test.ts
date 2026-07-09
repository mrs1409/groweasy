import { describe, it, expect } from 'vitest';
import { extractRowHeuristically } from '../src/utils/fallbackExtractor';

describe('extractRowHeuristically', () => {
  it('should map standard keys correctly', () => {
    const raw = {
      'Full Name': 'John Doe',
      'Email ID': 'john@example.com',
      'Phone': '+919876543210',
      'City': 'Bangalore',
      'Campaign': 'eden_park',
      'Status': 'interested',
    };

    const record = extractRowHeuristically(raw);

    expect(record.name).toBe('John Doe');
    expect(record.email).toBe('john@example.com');
    expect(record.mobile_without_country_code).toBe('9876543210');
    expect(record.country_code).toBe('+91');
    expect(record.city).toBe('Bangalore');
    expect(record.data_source).toBe('eden_park');
    expect(record.crm_status).toBe('interested');
  });

  it('should aggregate unmapped fields into crm_note', () => {
    const raw = {
      'Name': 'John Doe',
      'Email': 'john@example.com',
      'Phone': '9876543210',
      'Random Field 1': 'Value 1',
      'Random Field 2': 'Value 2',
    };

    const record = extractRowHeuristically(raw);

    expect(record.name).toBe('John Doe');
    expect(record.email).toBe('john@example.com');
    expect(record.mobile_without_country_code).toBe('9876543210');
    expect(record.crm_note).toContain('Random Field 1: Value 1');
    expect(record.crm_note).toContain('Random Field 2: Value 2');
  });

  it('should handle missing fields gracefully', () => {
    const raw = {
      'Name': 'John Doe',
    };

    const record = extractRowHeuristically(raw);

    expect(record.name).toBe('John Doe');
    expect(record.email).toBe('');
    expect(record.mobile_without_country_code).toBe('');
  });
});
