/**
 * Audit helpers — keep route handlers thin while still recording mutations.
 *
 * Route handlers call `recordAudit({...})` after a successful mutation.
 * Failures inside audit do NOT swallow — they propagate so the test layer
 * can verify behaviour. In production, callers wrap with try/catch as needed.
 */

import type { NextRequest } from 'next/server';

import type { AuditAction } from '@/domain/entities/AuditLog';
import { container } from '@/infrastructure/container/container';

/** Pulls actor_id from the `x-actor-id` request header. Null if absent. */
export function actorIdFromRequest(request: NextRequest): string | null {
  const value = request.headers.get('x-actor-id');
  return value && value.trim() ? value.trim() : null;
}

export interface RecordAuditInput {
  actorId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detailsJson: unknown;
}

export async function recordAudit(input: RecordAuditInput): Promise<void> {
  await container.writeAuditLog.execute({
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    detailsJson: input.detailsJson,
  });
}
