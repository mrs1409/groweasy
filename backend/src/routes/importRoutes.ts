import { Router, Request, Response } from 'express';
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
import { prisma } from '../config/prisma';

const router = Router();

// ─── Public ─────────────────────────────────
/**
 * GET /api/health
 * Liveness probe for deployment platforms. No auth required.
 */
router.get('/health', handleHealthCheck);

/**
 * GET /api/debug
 * Diagnoses production configuration. Shows env var status + DB connectivity.
 * PUBLIC — no auth required (safe: no secrets exposed).
 */
router.get('/debug', async (_req: Request, res: Response) => {
  let dbStatus = 'unknown';
  let dbDetail = '';
  try {
    const count = await prisma.user.count();
    dbStatus = 'connected';
    dbDetail = `${count} users in DB`;
  } catch (e: any) {
    dbStatus = 'error';
    dbDetail = e.message;
  }

  res.json({
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL
        ? `set (${process.env.DATABASE_URL.substring(0, 30)}...)`
        : '❌ NOT SET',
      CORS_ORIGIN: process.env.CORS_ORIGIN || '❌ NOT SET',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '✅ set' : '❌ NOT SET',
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? '✅ set' : '❌ NOT SET',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? '✅ set' : '❌ NOT SET',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? '✅ set' : '❌ NOT SET',
    },
    database: { status: dbStatus, detail: dbDetail },
    uptime: process.uptime(),
  });
});

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
