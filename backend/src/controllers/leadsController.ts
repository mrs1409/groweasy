// ============================================
// GrowEasy — Leads Controller
// ============================================
// GET /api/leads — searchable, filterable, sortable, paginated

import { Request, Response, NextFunction } from 'express';
import { leadRepository } from '../repositories/LeadRepository';
import { logger } from '../utils/logger';

/**
 * GET /api/leads
 *
 * Query params:
 *   page, limit, sortBy, sortOrder
 *   search, crmStatus, dataSource, city, country, importId
 *
 * All results are scoped to the authenticated user.
 */
export async function getLeads(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.dbUser!.id;

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const sortBy = String(req.query.sortBy ?? 'createdAt');
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

    const filters = {
      search: req.query.search ? String(req.query.search) : undefined,
      crmStatus: req.query.crmStatus ? String(req.query.crmStatus) : undefined,
      dataSource: req.query.dataSource ? String(req.query.dataSource) : undefined,
      city: req.query.city ? String(req.query.city) : undefined,
      country: req.query.country ? String(req.query.country) : undefined,
      importId: req.query.importId ? parseInt(String(req.query.importId), 10) : undefined,
    };

    const result = await leadRepository.findAllByUser(userId, filters, {
      page,
      limit,
      sortBy,
      sortOrder,
    });

    logger.info('Leads fetched', {
      userId,
      total: result.pagination.total,
      filters,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
