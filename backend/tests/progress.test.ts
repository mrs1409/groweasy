import { describe, it, expect, vi } from 'vitest';
import { progressService } from '../src/services/progressService';
import { Response } from 'express';

describe('progressService', () => {
  it('should register and stream updates to client res streams', () => {
    const mockWrite = vi.fn();
    const mockEnd = vi.fn();
    const mockRes = {
      write: mockWrite,
      end: mockEnd,
    } as unknown as Response;

    const progressId = 'test_prog_id';
    
    // Register
    progressService.register(progressId, mockRes);

    // Send update
    progressService.send(progressId, {
      percentage: 50,
      stage: 'AI Extraction',
      processedRows: 10,
      totalRows: 20,
    });

    expect(mockWrite).toHaveBeenCalled();
    const callArgs = mockWrite.mock.calls[0][0];
    expect(callArgs).toContain('data:');
    expect(callArgs).toContain('AI Extraction');
    expect(callArgs).toContain('"percentage":50');

    // Complete
    progressService.complete(progressId);
    expect(mockEnd).toHaveBeenCalled();
  });
});
