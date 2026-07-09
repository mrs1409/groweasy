// ============================================
// GrowEasy CSV Importer — API Routes
// ============================================

import { Router } from 'express';
import { upload } from '../middleware/upload';
import { rateLimiter } from '../middleware/rateLimiter';
import { authMiddleware } from '../middleware/authMiddleware';
import { handleImport, retryImport, handleHealthCheck, handleImportProgress } from '../controllers/importController';
import { getDashboardStats } from '../controllers/dashboardController';
import {
  getImports,
  getImportById,
  getImportLeads,
  downloadImportCSV,
  deleteImport,
} from '../controllers/historyController';
import { getLeads } from '../controllers/leadsController';

const router = Router();

// ─── Public ─────────────────────────────────
/**
 * GET /api/health
 * Liveness probe for deployment platforms. No auth required.
 */
router.get('/health', handleHealthCheck);

// ─── All routes below require Firebase auth ──
router.use(authMiddleware);

// ─── Dashboard ───────────────────────────────
/**
 * GET /api/dashboard
 * Aggregate stats for the authenticated user.
 */
router.get('/dashboard', getDashboardStats);

// ─── Imports ────────────────────────────────
/**
 * GET  /api/imports          — paginated import history (newest first)
 * POST /api/imports          — upload CSV and start AI extraction
 * GET  /api/imports/:id      — single import details
 * GET  /api/imports/:id/leads     — leads for an import (paginated)
 * GET  /api/imports/:id/download  — stream original CSV file
 * POST /api/imports/:id/retry     — re-run AI on a previous import
 * DELETE /api/imports/:id         — soft-delete an import
 */
router.get('/imports', getImports);
router.post('/imports', rateLimiter, upload.single('file'), handleImport);
router.get('/imports/progress/:progressId', handleImportProgress);
router.get('/imports/:id', getImportById);
router.get('/imports/:id/leads', getImportLeads);
router.get('/imports/:id/download', downloadImportCSV);
router.post('/imports/:id/retry', rateLimiter, retryImport);
router.delete('/imports/:id', deleteImport);

// ─── Leads ──────────────────────────────────
/**
 * GET /api/leads
 * All leads for the authenticated user.
 * Supports: search, crmStatus, dataSource, city, country, importId,
 *           page, limit, sortBy, sortOrder
 */
router.get('/leads', getLeads);

export default router;
