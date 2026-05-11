/**
 * POST /api/time-entries/:id/reject — transitions PENDING → REJECTED (T14).
 *
 * Body: { reason: string }  — reason is REQUIRED (AC-3). Missing/blank → 400.
 *
 * AC-2: requires manager (or admin) — enforced via withRole(['admin','manager']).
 * AC-4: non-PENDING current status → 422 INVALID_STATE_TRANSITION.
 * AC-7: audit row written with action='time-entry.rejected'.
 * AC-8: employee role is excluded from the gate.
 *
 * Reads X-Actor-Id header for rejectedBy (null if absent/empty).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { TimeEntryNotPendingError } from '@/domain/errors/TimeEntryNotPendingError';
import { container } from '@/infrastructure/container/container';
import {
  errorResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';
import { withRole } from '@/interfaces/http/helpers/withRole';

const rejectSchema = z
  .object({ reason: z.string().min(1, 'reason is required') })
  .strict();

export const POST = withRole(['admin', 'manager'])(async (
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> => {
  let reason: string;
  try {
    const text = await request.text();
    if (text.trim().length === 0) {
      return errorResponse('reason is required', 'VALIDATION_ERROR', 400);
    }
    const parsed = rejectSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      return errorResponse(parsed.error.message, 'VALIDATION_ERROR', 400);
    }
    reason = parsed.data.reason.trim();
    if (reason === '') {
      return errorResponse('reason is required', 'VALIDATION_ERROR', 400);
    }
  } catch {
    return errorResponse('Invalid JSON body', 'VALIDATION_ERROR', 400);
  }

  try {
    const actorHeader = request.headers.get('x-actor-id');
    const rejecterId = actorHeader && actorHeader.trim() !== '' ? actorHeader.trim() : null;

    const result = await container.rejectTimeEntry.execute({
      timeEntryId: params.id,
      rejecterId,
      reason,
    });

    await recordAuditEntry(request, {
      action: 'time-entry.rejected',
      resourceType: 'time_entry',
      resourceId: result.id,
      detailsJson: {
        transition: 'reject',
        rejected_at: result.rejected_at,
        rejected_by: result.rejected_by,
        reason: result.rejection_reason,
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
