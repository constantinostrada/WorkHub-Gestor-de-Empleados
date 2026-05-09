/**
 * AuditLog — Aggregate Root
 *
 * Append-only record of a mutation performed against a resource.
 * Owns invariants on action verb (must be one of the allowed verbs) and
 * resource_type / resource_id non-emptiness.
 */

import { DomainValidationError } from '../errors/DomainValidationError';

export type AuditAction = 'create' | 'update' | 'delete';

export const AUDIT_ACTIONS: readonly AuditAction[] = ['create', 'update', 'delete'] as const;

export interface AuditLogProps {
  id: string;
  actorId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detailsJson: unknown;
  createdAt: Date;
}

export class AuditLog {
  private readonly props: AuditLogProps;

  private constructor(props: AuditLogProps) {
    this.props = props;
  }

  static create(props: AuditLogProps): AuditLog {
    AuditLog.validate(props);
    return new AuditLog(props);
  }

  private static validate(props: AuditLogProps): void {
    if (!AUDIT_ACTIONS.includes(props.action)) {
      throw new DomainValidationError(
        `AuditLog action must be one of: ${AUDIT_ACTIONS.join(', ')}.`,
      );
    }
    if (!props.resourceType.trim()) {
      throw new DomainValidationError('AuditLog resourceType cannot be empty.');
    }
    if (!props.resourceId.trim()) {
      throw new DomainValidationError('AuditLog resourceId cannot be empty.');
    }
  }

  get id(): string { return this.props.id; }
  get actorId(): string | null { return this.props.actorId; }
  get action(): AuditAction { return this.props.action; }
  get resourceType(): string { return this.props.resourceType; }
  get resourceId(): string { return this.props.resourceId; }
  get detailsJson(): unknown { return this.props.detailsJson; }
  get createdAt(): Date { return this.props.createdAt; }
}
