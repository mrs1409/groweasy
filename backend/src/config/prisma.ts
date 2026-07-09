// ============================================
// GrowEasy — Prisma Client Singleton
// ============================================
// Prevents multiple PrismaClient instances during
// hot-reload (nodemon/ts-node dev restarts).

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Log slow queries in development
prisma.$on('query' as never, (e: any) => {
  if (e.duration > 500) {
    logger.warn('Slow Prisma query detected', {
      query: e.query,
      durationMs: e.duration,
    });
  }
});
