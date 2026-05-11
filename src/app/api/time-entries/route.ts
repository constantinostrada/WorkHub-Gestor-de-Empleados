/**
 * POST /api/time-entries — register worked hours for an employee on a date (AC-1)
 *
 * Body: { employee_id, date, hours, notes? }
 * Validation:
 *   - 400 when body shape / hours range / date-future is invalid
 *   - 404 when employee_id does not exist
 *   - 409 when an entry for (employee_id, date) already exists
 *   - 201 on success
 */

import { NextResponse, type NextRequest } from 'next/server';

import type { RegisterTimeEntryDto } from '@/application/dtos/timeEntry.dto';
import { EmployeeOffboardedError } from '@/domain/errors/EmployeeOffboardedError';
import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  handleError,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';
import { apiRegisterTimeEntrySchema } from '@/interfaces/http/validation/timeEntryValidation';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = apiRegisterTimeEntrySchema.safeParse(body);

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const dto: RegisterTimeEntryDto = {
      employeeId: parsed.data.employee_id,
      date:       parsed.data.date,
      hours:      parsed.data.hours,
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    };

    const result = await container.registerTimeEntry.execute(dto);
    await recordAuditEntry(request, {
      action: 'create',
      resourceType: 'time_entry',
      resourceId: result.id,
      detailsJson: {
        employee_id: parsed.data.employee_id,
        date: parsed.data.date,
        hours: parsed.data.hours,
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      },
    });
    return createdResponse(result);
  } catch (err) {
    // T13 AC-3: registering time for an offboarded employee → 422 with the
    // dedicated EMPLOYEE_OFFBOARDED code so the UI can show a tailored msg.
    if (err instanceof EmployeeOffboardedError) {
      return NextResponse.json(
        {
          error: err.message,
          code: 'EMPLOYEE_OFFBOARDED',
          details: {
            employee_id: err.employeeId,
            offboarded_at: err.offboardedAt.toISOString(),
          },
        },
        { status: 422 },
      );
    }
    return handleError(err);
  }
}
