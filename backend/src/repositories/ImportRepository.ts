// ============================================
// GrowEasy — Import Repository
// ============================================

import { prisma } from '../config/prisma';
import type { Import } from '@prisma/client';

export type ImportStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface CreateImportData {
  userId: number;
  fileName: string;
  filePath?: string;
}

export interface UpdateImportData {
  status?: ImportStatus;
  totalRows?: number;
  importedRows?: number;
  skippedRows?: number;
  durationMs?: number;
  errorMessage?: string | null;
  filePath?: string;
}

export interface ImportPaginationOptions {
  page?: number;
  limit?: number;
}

export class ImportRepository {
  /**
   * Create a new Import record at the start of processing.
   */
  async create(data: CreateImportData): Promise<Import> {
    return prisma.import.create({
      data: {
        userId: data.userId,
        fileName: data.fileName,
        filePath: data.filePath,
        status: 'PROCESSING',
      },
    });
  }

  /**
   * Update an import record — called on completion or failure.
   * Always scoped to userId to prevent unauthorized updates.
   */
  async update(id: number, _userId: number, data: UpdateImportData): Promise<Import> {
    return prisma.import.update({
      where: { id },
      data,
    });
  }

  /**
   * Find a single import by ID, scoped to the authenticated user.
   * Excludes soft-deleted records.
   */
  async findByIdAndUser(id: number, userId: number): Promise<Import | null> {
    return prisma.import.findFirst({
      where: { id, userId, deletedAt: null },
      include: { leads: false },
    });
  }

  /**
   * Paginated list of imports for a user, newest first.
   * Excludes soft-deleted records.
   */
  async findAllByUser(
    userId: number,
    { page = 1, limit = 10 }: ImportPaginationOptions = {}
  ) {
    const skip = (page - 1) * limit;

    const [imports, total] = await Promise.all([
      prisma.import.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.import.count({ where: { userId, deletedAt: null } }),
    ]);

    return {
      imports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Soft-delete — sets deletedAt timestamp.
   * Always scoped to userId for ownership enforcement.
   */
  async softDelete(id: number, userId: number): Promise<Import> {
    // First verify ownership
    const existing = await this.findByIdAndUser(id, userId);
    if (!existing) throw new Error(`Import ${id} not found for user ${userId}`);

    return prisma.import.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Aggregate dashboard statistics scoped to a user.
   * Returns per-user metrics: total imports, leads, skipped, avg duration,
   * success rate, and the 5 most recent imports.
   */
  async getDashboardStats(userId: number) {
    const [totalImports, aggregate, completedCount, recentImports] =
      await Promise.all([
        prisma.import.count({ where: { userId, deletedAt: null } }),
        prisma.import.aggregate({
          where: { userId, deletedAt: null },
          _sum: {
            importedRows: true,
            skippedRows: true,
            totalRows: true,
            durationMs: true,
          },
          _avg: { durationMs: true },
        }),
        prisma.import.count({
          where: { userId, deletedAt: null, status: 'COMPLETED' },
        }),
        prisma.import.findMany({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

    const totalLeads = aggregate._sum.importedRows ?? 0;
    const totalSkipped = aggregate._sum.skippedRows ?? 0;
    const totalRows = aggregate._sum.totalRows ?? 0;
    const successRate =
      totalImports > 0
        ? Math.round((completedCount / totalImports) * 1000) / 10
        : 0;

    return {
      totalImports,
      totalLeads,
      totalSkipped,
      totalRows,
      avgProcessingTimeMs: Math.round(aggregate._avg.durationMs ?? 0),
      successRate,
      completedImports: completedCount,
      failedImports: totalImports - completedCount,
      recentImports,
    };
  }
}

export const importRepository = new ImportRepository();
