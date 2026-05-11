/**
 * POST /api/employees/:id/offboard — soft-deactivate employee with cascade.
 *
 * Auth: T10 — admin only (role-gated via withRole).
 * Auth: T13 — requires X-Actor-Id header (mirroring T12 cancel pattern) so
 *   every cascaded audit row has a non-null actor. Missing/empty → 400
 *   {error:'missing_actor_id'} and NO state change happens.
 *
 * On success (200):
 *   {
 *     ...employeeDto,                  // offboarded=true, offboardedAt=ISO
 *     cancelled_vacations: [           // T13 AC-4 evidence for the caller
 *       { id, status_before, cancelled_at, reason }, ...
 *     ]
 *   }
 *
 * Audit (T13 AC-8): one entry with action='employee.offboarded' for the
 * employee itself, plus one entry with action='vacation.cancelled' per
 * cascaded vacation. Audit-write failures are logged but never break the
 * primary mutation (T6 contract).
 *
 * Error mapping:
 *   - 404 if employee does not exist (DomainNotFoundError → handleError)
 *   - 409 with code EMPLOYEE_ALREADY_OFFBOARDED if already offboarded (T13 AC-9)
 */

import { NextResponse, type NextRequest } from 'next/server';

import { EmployeeAlreadyOffboardedError } from '@/domain/errors/EmployeeAlreadyOffboardedError';
import { container } from '@/infrastructure/container/container';
import {
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { withRole } from '@/interfaces/http/helpers/withRole';

export const POST = withRole(['admin'])(async (
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> => {
  const actorHeader = request.headers.get('x-actor-id');
  const actorId = actorHeader && actorHeader.trim() !== '' ? actorHeader.trim() : null;
  if (actorId === null) {
    return NextResponse.json({ error: 'missing_actor_id' }, { status: 400 });
  }

  try {
    const now = new Date();
    const result = await container.offboardEmployee.execute({
      employeeId: params.id,
      now,
    });

    // AC-8: write one audit entry for the offboard itself, then one per
    // cascaded vacation. Failures here never break the primary mutation.
    try {
      await container.logAuditEntry.execute({
        actorId,
        action: 'employee.offboarded',
        resourceType: 'employee',
        resourceId: result.employee.id,
        detailsJson: {
          offboarded_at: result.employee.offboardedAt,
          cancelled_vacation_ids: result.cancelledVacations.map((v) => v.id),
        },
      });
    } catch (auditErr) {
      console.error('[audit] Failed to record employee.offboarded', auditErr);
    }

    for (const cv of result.cancelledVacations) {
      try {
        await container.logAuditEntry.execute({
          actorId,
          action: 'vacation.cancelled',
          resourceType: 'vacation',
          resourceId: cv.id,
          detailsJson: {
            vacation_status_before: cv.status_before,
            cancelled_at: cv.cancelled_at,
            reason: cv.reason,
            cascade_from_employee_offboard: result.employee.id,
          },
        });
      } catch (auditErr) {
        console.error('[audit] Failed to record cascade vacation.cancelled', auditErr);
      }
    }

    return successResponse({
      ...result.employee,
      cancelled_vacations: result.cancelledVacations,
    });
  } catch (err) {
    if (err instanceof EmployeeAlreadyOffboardedError) {
      return NextResponse.json(
        {
          error: err.message,
          code: 'EMPLOYEE_ALREADY_OFFBOARDED',
          details: {
            employee_id: err.employeeId,
            offboarded_at: err.offboardedAt.toISOString(),
          },
        },
        { status: 409 },
      );
    }
    return handleError(err);
  }
});
