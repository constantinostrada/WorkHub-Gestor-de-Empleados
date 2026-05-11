/**
 * POST /api/time-entries/:id/approve — transitions PENDING → APPROVED (T14).
 *
 * AC-2: requires manager (or admin) — enforced via withRole(['admin','manager']).
 * AC-4: non-PENDING current status → 422 INVALID_STATE_TRANSITION.
 * AC-7: audit row written with action='time-entry.approved'.
 * AC-8: employee role is excluded from the gate, so employees cannot approve.
 *
 * Reads X-Actor-Id header for approvedBy (null if absent/empty).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { TimeEntryNotPendingError } from '@/domain/errors/TimeEntryNotPendingError';
import { container } from '@/infrastructure/container/container';
import {
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';
import { withRole } from '@/interfaces/http/helpers/withRole';

export const POST = withRole(['admin', 'manager'])(async (
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> => {
  try {
    const actorHeader = request.headers.get('x-actor-id');
    const approverId = actorHeader && actorHeader.trim() !== '' ? actorHeader.trim() : null;

    const result = await container.approveTimeEntry.execute({
      timeEntryId: params.id,
      approverId,
    });

    await recordAuditEntry(request, {
      action: 'time-entry.approved',
      resourceType: 'time_entry',
      resourceId: result.id,
      detailsJson: {
        transition: 'approve',
        approved_at: result.approved_at,
        approved_by: result.approved_by,
      },
    });

    return successResponse(result);
  } catch (err) {
    if (err instanceof TimeEntryNotPendingError) {
      return NextResponse.json(
        {
          error: 'invalid_state_transition',
          code: 'INVALID_STATE_TRANSITION',
          current_status: err.currentStatus,
        },
        { status: 422 },
      );
    }
    return handleError(err);
  }
});
