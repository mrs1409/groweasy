// ============================================
// GrowEasy CSV Importer — Express App Factory
// ============================================

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { config } from './config';
// ⚠️ Must be imported before any route that uses Firebase Admin
import './config/firebaseAdmin';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

/**
 * Create and configure the Express application.
 *
 * Separated from the server startup (index.ts) for testability —
 * tests can import the app without starting the HTTP server.
 *
 * Middleware order matters:
 * 1. CORS — must be first to handle preflight requests
 * 2. JSON body parser — for any JSON payloads
 * 3. Request logging — log every incoming request
 * 4. Routes — all API route handlers
 * 5. 404 handler — catch unmatched routes
 * 6. Error handler — global error handling (must be last)
 */
export function createApp(): express.Application {
  const app = express();

  // ─── Security Headers ───────────────────────
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // ─── Compression ───────────────────────────
  app.use(compression());

  // ─── CORS ────────────────────────────────────
  const allowedOrigins = Array.isArray(config.corsOrigin)
    ? config.corsOrigin
    : [config.corsOrigin];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin header) and health checks
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      logger.warn('CORS blocked request from unauthorized origin', { origin, allowedOrigins });
      return callback(new Error(`CORS: origin '${origin}' is not allowed.`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Progress-ID', 'x-progress-id'],
    credentials: true,
    maxAge: 86400, // 24 hours — reduces preflight frequency
  }));

  // Explicitly handle OPTIONS preflight for all routes
  app.options('*', cors());


  // ─── Body Parsers ───────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ─── Request Logging ────────────────────────
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    next();
  });

  // ─── API Routes ─────────────────────────────
  app.use('/api', routes);

  // ─── 404 Handler ────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint does not exist.',
      },
    });
  });

  // ─── Global Error Handler (must be last) ────
  app.use(errorHandler);

  return app;
}
