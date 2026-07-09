// ============================================
// GrowEasy — Lead Repository
// ============================================

import { prisma } from '../config/prisma';
import type { CRMRecord } from '../types';

export interface LeadFilters {
  search?: string;
  crmStatus?: string;
  dataSource?: string;
  city?: string;
  country?: string;
  importId?: number;
}

export interface LeadPaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

const VALID_SORT_FIELDS = [
  'createdAt',
  'name',
  'email',
  'crmStatus',
  'city',
  'country',
  'company',
];

export class LeadRepository {
  /**
   * Bulk insert CRM records after a successful AI extraction.
   * Always sets userId and importId for ownership tracking.
   */
  async createMany(
    userId: number,
    importId: number,
    records: CRMRecord[]
  ): Promise<{ count: number }> {
    const data = records.map((r) => ({
      userId,
      importId,
      leadCreatedAt: r.created_at || null,
      name: r.name || null,
      email: r.email || null,
      countryCode: r.country_code || null,
      mobileWithoutCountryCode: r.mobile_without_country_code || null,
      company: r.company || null,
      city: r.city || null,
      state: r.state || null,
      country: r.country || null,
      leadOwner: r.lead_owner || null,
      crmStatus: r.crm_status || null,
      crmNote: r.crm_note || null,
      dataSource: r.data_source || null,
      possessionTime: r.possession_time || null,
      description: r.description || null,
    }));

    return prisma.lead.createMany({ data });
  }

  /**
   * Delete all leads for an import (used in retry flow).
   */
  async deleteByImport(importId: number): Promise<{ count: number }> {
    return prisma.lead.deleteMany({ where: { importId } });
  }

  /**
   * Get paginated leads for a specific import.
   * Enforces userId for ownership.
   */
  async findByImport(
    importId: number,
    userId: number,
    { page = 1, limit = 50 }: LeadPaginationOptions = {}
  ) {
    const skip = (page - 1) * limit;
    const where = { importId, userId };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.lead.count({ where }),
    ]);

    return {
      leads,
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
   * Searchable, filterable, sortable, paginated leads for a user.
   * All queries are scoped by userId — frontend never sends userId.
   */
  async findAllByUser(
    userId: number,
    filters: LeadFilters = {},
    pagination: LeadPaginationOptions = {}
  ) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = pagination;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = { userId };

    if (filters.importId) where.importId = filters.importId;
    if (filters.crmStatus) where.crmStatus = filters.crmStatus;
    if (filters.dataSource) where.dataSource = filters.dataSource;

    if (filters.city) {
      where.city = { contains: filters.city };
    }
    if (filters.country) {
      where.country = { contains: filters.country };
    }

    // Full-text search across key fields
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { email: { contains: filters.search } },
        { company: { contains: filters.search } },
        { city: { contains: filters.search } },
        { crmNote: { contains: filters.search } },
        { mobileWithoutCountryCode: { contains: filters.search } },
      ];
    }

    const safeSortBy = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const orderBy = { [safeSortBy]: sortOrder };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({ where, skip, take: limit, orderBy }),
      prisma.lead.count({ where }),
    ]);

    return {
      leads,
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
}

export const leadRepository = new LeadRepository();
