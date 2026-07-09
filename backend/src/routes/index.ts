// ============================================
// GrowEasy CSV Importer — Route Aggregator
// ============================================

import { Router } from 'express';
import importRoutes from './importRoutes';

const router = Router();

/**
 * Mount all route modules under /api.
 *
 * This aggregator pattern allows easy addition of
 * new route modules without modifying the app factory.
 *
 * Current routes:
 * - POST /api/import — CSV upload and AI extraction
 * - GET  /api/health — Health check
 */
router.use('/', importRoutes);

export default router;
