/**
 * Tiny route-level helper that records an audit log row after a successful
 * POST. Reads optional X-Actor-Id header. Errors during the audit write are
 * logged but never propagated, so the primary mutation does not fail because
 * audit logging failed.
 */

import type { NextRequest } from 'next/server';

import type { AuditAction } from '@/domain/entities/AuditLog';
import { container } from '@/infrastructure/container/container';

export interface AuditEvent {
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detailsJson?: Record<string, unknown>;
}

export async function recordAuditEntry(
  request: NextRequest,
  event: AuditEvent,
): Promise<void> {
  try {
    const actorHeader = request.headers.get('x-actor-id');
    const actorId = actorHeader && actorHeader.trim() !== '' ? actorHeader : null;
    await container.logAuditEntry.execute({
      actorId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      ...(event.detailsJson !== undefined ? { detailsJson: event.detailsJson } : {}),
    });
  } catch (err) {
    console.error('[audit] Failed to record audit entry', err);
  }
}
