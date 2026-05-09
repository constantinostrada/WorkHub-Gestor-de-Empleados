import { AUDIT_ACTIONS, type AuditAction } from '@/domain/entities/AuditLog';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type {
  IAuditLogRepository,
  AuditLogQueryFilter,
} from '@/domain/repositories/IAuditLogRepository';

import type { AuditLogsListResponseDto, ListAuditLogsDto } from '../../dtos/audit.dto';
import { AuditLogMapper } from '../../mappers/AuditLogMapper';

/**
 * Lists audit logs with optional filters and limit/offset pagination.
 *
 * Validation:
 *   - `since` must be a parseable ISO 8601 timestamp.
 *   - `action` (when present) must be one of the allowed verbs.
 *   - `limit` defaults to 50, capped to MAX (200).
 *   - `offset` defaults to 0, must be ≥ 0.
 *
 * Returns shape mandated by AC-6: { logs, total, has_more }.
 */
export class ListAuditLogsUseCase {
  static readonly DEFAULT_LIMIT = 50;
  static readonly MAX_LIMIT = 200;

  constructor(private readonly repo: IAuditLogRepository) {}

  async execute(dto: ListAuditLogsDto = {}): Promise<AuditLogsListResponseDto> {
    const filter: AuditLogQueryFilter = {};

    if (dto.since !== undefined) {
      const since = new Date(dto.since);
      if (Number.isNaN(since.getTime())) {
        throw new DomainValidationError(`'since' is not a valid ISO 8601 timestamp.`);
      }
      filter.since = since;
    }

    if (dto.actor !== undefined) {
      if (!dto.actor.trim()) {
        throw new DomainValidationError(`'actor' cannot be empty.`);
      }
      filter.actorId = dto.actor;
    }

    if (dto.action !== undefined) {
      if (!AUDIT_ACTIONS.includes(dto.action as AuditAction)) {
        throw new DomainValidationError(
          `'action' must be one of: ${AUDIT_ACTIONS.join(', ')}.`,
        );
      }
      filter.action = dto.action as AuditAction;
    }

    let limit = dto.limit ?? ListAuditLogsUseCase.DEFAULT_LIMIT;
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new DomainValidationError(`'limit' must be a positive number.`);
    }
    if (limit > ListAuditLogsUseCase.MAX_LIMIT) {
      limit = ListAuditLogsUseCase.MAX_LIMIT;
    }

    const offset = dto.offset ?? 0;
    if (!Number.isFinite(offset) || offset < 0) {
      throw new DomainValidationError(`'offset' must be a non-negative number.`);
    }

    const { items, total } = await this.repo.find(filter, { limit, offset });

    return {
      logs: items.map((log) => AuditLogMapper.toResponseDto(log)),
      total,
      has_more: offset + items.length < total,
    };
  }
}
