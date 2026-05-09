/**
 * PrismaAuditLogRepository — Infrastructure Implementation
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import { AuditLog, type AuditAction } from '@/domain/entities/AuditLog';
import type {
  AuditLogQueryFilter,
  AuditLogQueryOptions,
  AuditLogQueryResult,
  IAuditLogRepository,
} from '@/domain/repositories/IAuditLogRepository';

type AuditLogRow = {
  id: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  detailsJson: Prisma.JsonValue;
  createdAt: Date;
};

export class PrismaAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly db: PrismaClient) {}

  private toDomain(row: AuditLogRow): AuditLog {
    return AuditLog.create({
      id: row.id,
      actorId: row.actorId,
      action: row.action as AuditAction,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      detailsJson: row.detailsJson,
      createdAt: row.createdAt,
    });
  }

  async save(log: AuditLog): Promise<void> {
    await this.db.auditLog.create({
      data: {
        id: log.id,
        actorId: log.actorId,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        detailsJson: (log.detailsJson ?? {}) as Prisma.InputJsonValue,
        createdAt: log.createdAt,
      },
    });
  }

  async find(
    filter: AuditLogQueryFilter,
    options: AuditLogQueryOptions,
  ): Promise<AuditLogQueryResult> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.since !== undefined ? { createdAt: { gte: filter.since } } : {}),
      ...(filter.actorId !== undefined ? { actorId: filter.actorId } : {}),
      ...(filter.action !== undefined ? { action: filter.action } : {}),
    };

    const [rows, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit,
        skip: options.offset,
      }),
      this.db.auditLog.count({ where }),
    ]);

    return { items: rows.map((r) => this.toDomain(r)), total };
  }
}
