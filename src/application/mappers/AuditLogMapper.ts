import type { AuditLog } from '@/domain/entities/AuditLog';

import type { AuditLogResponseDto } from '../dtos/audit.dto';

export class AuditLogMapper {
  static toResponseDto(log: AuditLog): AuditLogResponseDto {
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
}
