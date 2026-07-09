import Papa from 'papaparse';
import type { ParsedCSV, RawCSVRecord } from '@/types';

/**
 * Parse a CSV file client-side using PapaParse.
 * This runs entirely in the browser — no API call needed.
 */
export function parseCSVFile(file: File): Promise<ParsedCSV> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawCSVRecord>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header: string) => header.trim(),
      complete: (results) => {
        const headers = results.meta.fields || [];
        const rows = results.data.filter(row => {
          // Filter out completely empty rows
          return Object.values(row).some(val => val && val.trim() !== '');
        });

        resolve({
          headers,
          rows,
          totalRows: rows.length,
        });
      },
      error: (error: Error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
    });
  });
}
