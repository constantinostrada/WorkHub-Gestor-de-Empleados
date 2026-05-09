/**
 * IAuditLogRepository — Repository Interface (Domain)
 */

import type { AuditAction, AuditLog } from '../entities/AuditLog';

export interface AuditLogQueryFilter {
  since?: Date;
  actorId?: string;
  action?: AuditAction;
}

export interface AuditLogQueryOptions {
  limit: number;
  offset: number;
}

export interface AuditLogQueryResult {
  items: AuditLog[];
  total: number;
}

export interface IAuditLogRepository {
  /** Persist a new audit log row. */
  save(log: AuditLog): Promise<void>;

  /**
   * List audit logs ordered DESC by createdAt with optional filters
   * and limit/offset pagination. Returns total = count matching the
   * filter (independent of pagination) so callers can compute has_more.
   */
  find(filter: AuditLogQueryFilter, options: AuditLogQueryOptions): Promise<AuditLogQueryResult>;
}
