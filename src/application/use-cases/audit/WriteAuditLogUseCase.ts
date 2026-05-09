import { randomUUID } from 'crypto';

import { AuditLog } from '@/domain/entities/AuditLog';
import type { IAuditLogRepository } from '@/domain/repositories/IAuditLogRepository';

import type { WriteAuditLogDto } from '../../dtos/audit.dto';

/**
 * Persists a single audit log entry. Called by route handlers AFTER a
 * successful mutation; never invoked from inside another use case so the
 * audit trail captures interface-level intent (actor, raw payload).
 */
export class WriteAuditLogUseCase {
  constructor(private readonly repo: IAuditLogRepository) {}

  async execute(dto: WriteAuditLogDto): Promise<void> {
    const log = AuditLog.create({
      id: randomUUID(),
      actorId: dto.actorId,
      action: dto.action,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      detailsJson: dto.detailsJson,
      createdAt: new Date(),
    });
    await this.repo.save(log);
  }
}
