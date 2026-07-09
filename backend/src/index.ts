// ============================================
// GrowEasy CSV Importer — Server Entry Point
// ============================================

import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';

/**
 * Start the Express HTTP server.
 *
 * This is the only file that actually starts listening.
 * The app factory (app.ts) is separate for testability.
 */
function startServer(): void {
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`🚀 GrowEasy CSV Importer Backend running`, {
      port: config.port,
      environment: config.nodeEnv,
      corsOrigin: config.corsOrigin,
      batchSize: config.batchSize,
      maxRetries: config.maxRetries,
      maxFileSizeMB: config.maxFileSizeMB,
    });

    logger.info(`📍 API endpoints:`, {
      import: `http://localhost:${config.port}/api/import`,
      health: `http://localhost:${config.port}/api/health`,
    });
  });

  // ─── Graceful Shutdown ──────────────────────
  const shutdown = (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully...`);
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ─── Unhandled Errors ───────────────────────
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception — shutting down', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

startServer();
