import type { AuditLog, AuditAction } from '../entities/AuditLog';

export interface FindAuditLogsFilter {
  since?: Date;
  actorId?: string;
  action?: AuditAction;
}

export interface FindAuditLogsPagination {
  limit: number;
  offset: number;
}

export interface AuditLogPaginatedResult {
  logs: AuditLog[];
  total: number;
}

export interface IAuditLogRepository {
  save(entry: AuditLog): Promise<void>;
  findMany(filter: FindAuditLogsFilter, pagination: FindAuditLogsPagination): Promise<AuditLogPaginatedResult>;
}
