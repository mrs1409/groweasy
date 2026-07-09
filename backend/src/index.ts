import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './config/prisma';

/**
 * Start the Express HTTP server.
 */
async function startServer(): Promise<void> {
  // ─── DB Connectivity Check ───────────────────
  try {
    await prisma.$connect();
    const userCount = await prisma.user.count();
    logger.info('✅ Database connected', {
      provider: 'postgresql',
      users: userCount,
    });
  } catch (err: any) {
    logger.error('❌ Database connection failed at startup', {
      error: err.message,
      hint: 'Ensure DATABASE_URL is set correctly in Render environment variables',
    });
    // Don't exit — let the server start so /api/health still responds
    // Individual requests will fail with 500 until DB is available
  }

  const app = createApp();

  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info(`🚀 GrowEasy CSV Importer Backend running`, {
      port: config.port,
      environment: config.nodeEnv,
      corsOrigin: config.corsOrigin,
      batchSize: config.batchSize,
      maxRetries: config.maxRetries,
      maxFileSizeMB: config.maxFileSizeMB,
    });

    logger.info(`📍 API endpoints:`, {
      import: `http://localhost:${config.port}/api/imports`,
      health: `http://localhost:${config.port}/api/health`,
      debug: `http://localhost:${config.port}/api/debug`,
    });
  });

  // ─── Graceful Shutdown ──────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully...`);
    await prisma.$disconnect();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

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

