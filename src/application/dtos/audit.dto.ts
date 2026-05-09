/**
 * Audit DTOs — application boundary contracts.
 */

import type { AuditAction } from '@/domain/entities/AuditLog';

export interface WriteAuditLogDto {
  actorId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detailsJson: unknown;
}

export interface ListAuditLogsDto {
  since?: string;          // ISO8601
  actor?: string;          // employee id
  action?: string;         // create | update | delete (validated in use case)
  limit?: number;
  offset?: number;
}

export interface AuditLogResponseDto {
  id: string;
  actor_id: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string;
  details_json: unknown;
  created_at: string;      // ISO8601
}

export interface AuditLogsListResponseDto {
  logs: AuditLogResponseDto[];
  total: number;
  has_more: boolean;
}
