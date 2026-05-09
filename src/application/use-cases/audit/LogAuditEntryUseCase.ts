import { randomUUID } from 'crypto';

import type { LogAuditEntryDto } from '@/application/dtos/audit.dto';
import { AuditLog } from '@/domain/entities/AuditLog';
import type { IAuditLogRepository } from '@/domain/repositories/IAuditLogRepository';

export class LogAuditEntryUseCase {
  constructor(private readonly auditRepo: IAuditLogRepository) {}

  async execute(dto: LogAuditEntryDto): Promise<void> {
    const entry = AuditLog.create({
      id: randomUUID(),
      actorId: dto.actorId,
      action: dto.action,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      ...(dto.detailsJson !== undefined ? { detailsJson: dto.detailsJson } : {}),
    });
    await this.auditRepo.save(entry);
  }
}
