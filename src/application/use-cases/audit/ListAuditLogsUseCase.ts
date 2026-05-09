import type {
  AuditLogResponseDto,
  ListAuditLogsDto,
  ListAuditLogsResponseDto,
} from '@/application/dtos/audit.dto';
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditLog,
} from '@/domain/entities/AuditLog';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type {
  FindAuditLogsFilter,
  IAuditLogRepository,
} from '@/domain/repositories/IAuditLogRepository';

export const AUDIT_DEFAULT_LIMIT = 50;
export const AUDIT_MAX_LIMIT = 200;

export class ListAuditLogsUseCase {
  constructor(private readonly auditRepo: IAuditLogRepository) {}

  async execute(dto: ListAuditLogsDto): Promise<ListAuditLogsResponseDto> {
    const filter: FindAuditLogsFilter = {};

    if (dto.since !== undefined) {
      const since = new Date(dto.since);
      if (Number.isNaN(since.getTime())) {
        throw new DomainValidationError(`Invalid 'since' parameter: must be ISO8601`);
      }
      filter.since = since;
    }

    if (dto.actor !== undefined && dto.actor !== '') {
      filter.actorId = dto.actor;
    }

    if (dto.action !== undefined && dto.action !== '') {
      if (!AUDIT_ACTIONS.includes(dto.action as AuditAction)) {
        throw new DomainValidationError(
          `Invalid 'action' parameter: must be one of ${AUDIT_ACTIONS.join(', ')}`,
        );
      }
      filter.action = dto.action as AuditAction;
    }

    const limit = clampLimit(dto.limit);
    const offset = clampOffset(dto.offset);

    const { logs, total } = await this.auditRepo.findMany(filter, { limit, offset });

    return {
      logs: logs.map(toResponse),
      total,
      has_more: offset + logs.length < total,
    };
  }
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined) return AUDIT_DEFAULT_LIMIT;
  if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
    throw new DomainValidationError(`Invalid 'limit': must be a positive integer`);
  }
  return Math.min(raw, AUDIT_MAX_LIMIT);
}

function clampOffset(raw: number | undefined): number {
  if (raw === undefined) return 0;
  if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
    throw new DomainValidationError(`Invalid 'offset': must be a non-negative integer`);
  }
  return raw;
}

function toResponse(log: AuditLog): AuditLogResponseDto {
  return {
    id: log.id,
    actor_id: log.actorId,
    action: log.action,
    resource_type: log.resourceType,
    resource_id: log.resourceId,
    details_json: log.detailsJson,
    created_at: log.createdAt.toISOString(),
  };
}
