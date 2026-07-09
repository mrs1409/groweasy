// ============================================
// GrowEasy CSV Importer — Progress Ingestion Service (SSE)
// ============================================

import { Response } from 'express';
import { logger } from '../utils/logger';

export interface ProgressEvent {
  percentage: number;
  stage: 'Uploading CSV' | 'Parsing CSV' | 'Creating Batches' | 'AI Extraction' | 'Validating AI Output' | 'Saving to Database' | 'Completed' | 'Failed';
  processedRows: number;
  totalRows: number;
  currentBatch: number;
  totalBatches: number;
  estimatedRemainingTimeMs?: number;
  elapsedTimeMs: number;
  completed: boolean;
  error?: string;
}

class ProgressService {
  private activeStreams = new Map<string, Response>();
  private startTimes = new Map<string, number>();

  /**
   * Register a new client SSE response stream.
   */
  public register(progressId: string, res: Response): void {
    logger.info(`SSE client registered for progressId: ${progressId}`);
    this.activeStreams.set(progressId, res);
    this.startTimes.set(progressId, Date.now());
  }

  /**
   * Unregister an active progress stream.
   */
  public unregister(progressId: string): void {
    if (this.activeStreams.has(progressId)) {
      logger.info(`SSE client unregistered for progressId: ${progressId}`);
      this.activeStreams.delete(progressId);
      this.startTimes.delete(progressId);
    }
  }

  /**
   * Get elapsed time for an active progress session.
   */
  public getElapsedTimeMs(progressId: string): number {
    const start = this.startTimes.get(progressId);
    return start ? Date.now() - start : 0;
  }

  /**
   * Send a progress update event to the registered client.
   */
  public send(progressId: string, update: Partial<ProgressEvent>): void {
    const res = this.activeStreams.get(progressId);
    if (!res) {
      return;
    }

    const elapsedTimeMs = this.getElapsedTimeMs(progressId);

    const event: ProgressEvent = {
      percentage: update.percentage ?? 0,
      stage: (update.stage as any) ?? 'Parsing CSV',
      processedRows: update.processedRows ?? 0,
      totalRows: update.totalRows ?? 0,
      currentBatch: update.currentBatch ?? 0,
      totalBatches: update.totalBatches ?? 0,
      elapsedTimeMs,
      completed: update.completed ?? false,
      estimatedRemainingTimeMs: update.estimatedRemainingTimeMs,
      error: update.error,
    };

    logger.debug(`Streaming progress update to ${progressId}`, event as unknown as Record<string, unknown>);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /**
   * Mark the progress session as fully completed and close stream.
   */
  public complete(progressId: string): void {
    const res = this.activeStreams.get(progressId);
    if (res) {
      this.send(progressId, {
        percentage: 100,
        stage: 'Completed',
        completed: true,
      });
      res.end();
    }
    this.unregister(progressId);
  }

  /**
   * Mark progress session as failed and close stream.
   */
  public fail(progressId: string, error: string): void {
    const res = this.activeStreams.get(progressId);
    if (res) {
      this.send(progressId, {
        stage: 'Failed',
        completed: true,
        error,
      });
      res.end();
    }
    this.unregister(progressId);
  }
}

export const progressService = new ProgressService();
