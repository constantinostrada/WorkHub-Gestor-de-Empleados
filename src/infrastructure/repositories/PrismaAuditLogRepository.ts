import type { Prisma, PrismaClient } from '@prisma/client';

import { AuditLog, type AuditAction } from '@/domain/entities/AuditLog';
import type {
  AuditLogPaginatedResult,
  FindAuditLogsFilter,
  FindAuditLogsPagination,
  IAuditLogRepository,
} from '@/domain/repositories/IAuditLogRepository';

interface AuditLogRow {
  id: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  detailsJson: Prisma.JsonValue;
  createdAt: Date;
}

export class PrismaAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(entry: AuditLog): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: entry.id,
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        detailsJson: entry.detailsJson as Prisma.InputJsonValue,
        createdAt: entry.createdAt,
      },
    });
  }

  async findMany(
    filter: FindAuditLogsFilter,
    pagination: FindAuditLogsPagination,
  ): Promise<AuditLogPaginatedResult> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.since !== undefined ? { createdAt: { gte: filter.since } } : {}),
      ...(filter.actorId !== undefined ? { actorId: filter.actorId } : {}),
      ...(filter.action !== undefined ? { action: filter.action } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const logs = rows.map((r: AuditLogRow) =>
      AuditLog.fromPersistence({
        id: r.id,
        actorId: r.actorId,
        action: r.action as AuditAction,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        detailsJson: (r.detailsJson ?? {}) as Record<string, unknown>,
        createdAt: r.createdAt,
      }),
    );
    return { logs, total };
  }
}
