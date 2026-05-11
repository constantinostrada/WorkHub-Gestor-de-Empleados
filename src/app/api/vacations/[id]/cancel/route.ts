/**
 * POST /api/vacations/:id/cancel — transitions PENDING|APPROVED → CANCELLED.
 *
 * Auth: T12 requires the X-Actor-Id header so the resulting audit row has a
 * non-null actor. Missing/empty header → 400 {error:'missing_actor_id'} and
 * NO audit row is written (so the audit table never sees an anonymous cancel).
 *
 * Body is empty. Two AC-mandated 422 error shapes:
 *   - { error: "vacation_already_started", start_date: ISO8601 }
 *   - { error: "vacation_not_cancellable", current_status: <string> }
 * Everything else (404, 500) flows through handleError as usual.
 *
 * On success, an audit row is written with:
 *   action='vacation.cancelled', resource_type='vacation',
 *   resource_id=<vacationId>, actor_id=<X-Actor-Id>,
 *   details_json={ vacation_status_before, cancelled_at }
 */

import { NextResponse, type NextRequest } from 'next/server';

import { VacationAlreadyStartedError } from '@/domain/errors/VacationAlreadyStartedError';
import { VacationNotCancellableError } from '@/domain/errors/VacationNotCancellableError';

import { container } from '@/infrastructure/container/container';
import {
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { withRole } from '@/interfaces/http/helpers/withRole';

export const POST = withRole(['admin', 'manager', 'employee'])(async (
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> => {
  const actorHeader = request.headers.get('x-actor-id');
  const actorId = actorHeader && actorHeader.trim() !== '' ? actorHeader.trim() : null;
  if (actorId === null) {
    return NextResponse.json({ error: 'missing_actor_id' }, { status: 400 });
  }

  try {
    const result = await container.cancelVacation.execute({
      vacationId: params.id,
      now: new Date(),
    });

    try {
      await container.logAuditEntry.execute({
        actorId,
        action: 'vacation.cancelled',
        resourceType: 'vacation',
        resourceId: result.vacation.id,
        detailsJson: {
          vacation_status_before: result.vacation_status_before,
          cancelled_at: result.vacation.cancelled_at,
        },
      });
    } catch (auditErr) {
      // T6 contract: audit-write failures never break the primary mutation.
      console.error('[audit] Failed to record vacation.cancelled', auditErr);
    }

    return successResponse(result.vacation);
  } catch (err) {
    if (err instanceof VacationAlreadyStartedError) {
      return NextResponse.json(
        {
          error: 'vacation_already_started',
          start_date: err.startDate.toISOString(),
        },
        { status: 422 },
      );
    }
    if (err instanceof VacationNotCancellableError) {
      return NextResponse.json(
        {
          error: 'vacation_not_cancellable',
          current_status: err.currentStatus,
        },
        { status: 422 },
      );
    }
    return handleError(err);
  }
});
