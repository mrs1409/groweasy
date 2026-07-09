// ============================================
// GrowEasy — Dashboard Controller
// ============================================
// GET /api/dashboard — returns per-user aggregate stats

import { Request, Response, NextFunction } from 'express';
import { importRepository } from '../repositories/ImportRepository';
import { logger } from '../utils/logger';

/**
 * GET /api/dashboard
 *
 * Returns aggregate metrics for the authenticated user:
 * - totalImports, totalLeads, totalSkipped, totalRows
 * - avgProcessingTimeMs, successRate
 * - completedImports, failedImports
 * - recentImports (last 5)
 */
export async function getDashboardStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.dbUser!.id;

    const stats = await importRepository.getDashboardStats(userId);

    logger.info('Dashboard stats fetched', { userId });

    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}
