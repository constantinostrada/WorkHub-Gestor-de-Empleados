import type { AuditAction } from '@/domain/entities/AuditLog';

export interface LogAuditEntryDto {
  actorId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detailsJson?: Record<string, unknown>;
}

export interface ListAuditLogsDto {
  since?: string;
  actor?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogResponseDto {
  id: string;
  actor_id: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string;
  details_json: Record<string, unknown>;
  created_at: string;
}

export interface ListAuditLogsResponseDto {
  logs: AuditLogResponseDto[];
  total: number;
  has_more: boolean;
}
