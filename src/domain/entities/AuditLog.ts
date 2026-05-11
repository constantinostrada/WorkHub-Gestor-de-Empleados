import { DomainValidationError } from '../errors/DomainValidationError';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'vacation.cancelled'
  | 'vacation.approved'
  | 'vacation.rejected'
  | 'webhook.delivered'
  | 'webhook.failed';

export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'create',
  'update',
  'delete',
  'vacation.cancelled',
  'vacation.approved',
  'vacation.rejected',
  'webhook.delivered',
  'webhook.failed',
] as const;

export interface AuditLogProps {
  id: string;
  actorId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detailsJson: Record<string, unknown>;
  createdAt: Date;
}

export interface AuditLogCreateInput {
  id: string;
  actorId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detailsJson?: Record<string, unknown>;
  createdAt?: Date;
}

export class AuditLog {
  private constructor(private readonly props: AuditLogProps) {}

  static create(input: AuditLogCreateInput): AuditLog {
    if (!input.id || input.id.trim() === '') {
      throw new DomainValidationError('AuditLog.id is required');
    }
    if (!AUDIT_ACTIONS.includes(input.action)) {
      throw new DomainValidationError(
        `AuditLog.action must be one of ${AUDIT_ACTIONS.join(', ')}`,
      );
    }
    if (!input.resourceType || input.resourceType.trim() === '') {
      throw new DomainValidationError('AuditLog.resourceType is required');
    }
    if (!input.resourceId || input.resourceId.trim() === '') {
      throw new DomainValidationError('AuditLog.resourceId is required');
    }

    return new AuditLog({
      id: input.id,
      actorId: input.actorId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      detailsJson: input.detailsJson ?? {},
      createdAt: input.createdAt ?? new Date(),
    });
  }

  static fromPersistence(props: AuditLogProps): AuditLog {
    return new AuditLog(props);
  }

  get id(): string { return this.props.id; }
  get actorId(): string | null { return this.props.actorId; }
  get action(): AuditAction { return this.props.action; }
  get resourceType(): string { return this.props.resourceType; }
  get resourceId(): string { return this.props.resourceId; }
  get detailsJson(): Record<string, unknown> { return this.props.detailsJson; }
  get createdAt(): Date { return this.props.createdAt; }
}
