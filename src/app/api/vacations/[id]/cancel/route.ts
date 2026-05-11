/**
 * POST /api/vacations/:id/cancel — transitions PENDING|APPROVED → CANCELLED.
 * Body is empty. Two AC-mandated 422 error shapes:
 *   - { error: "vacation_already_started", start_date: ISO8601 } when
 *     start_date <= now
 *   - { error: "vacation_not_cancellable", current_status: <string> } when
 *     current status is CANCELLED or REJECTED
 * Everything else (404, 500) flows through handleError as usual.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { VacationAlreadyStartedError } from '@/domain/errors/VacationAlreadyStartedError';
import { VacationNotCancellableError } from '@/domain/errors/VacationNotCancellableError';

import { container } from '@/infrastructure/container/container';
import {
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';
import { withRole } from '@/interfaces/http/helpers/withRole';

export const POST = withRole(['admin', 'manager', 'employee'])(async (
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> => {
  try {
    const result = await container.cancelVacation.execute({
      vacationId: params.id,
      now: new Date(),
    });

    await recordAuditEntry(request, {
      action: 'update',
      resourceType: 'vacation',
      resourceId: result.id,
      detailsJson: { transition: 'cancel' },
    });

    return successResponse(result);
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
