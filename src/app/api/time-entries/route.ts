/**
 * /api/time-entries
 *
 * - POST: register worked hours for an employee on a date (T3 AC-1).
 *     Body: { employee_id, date, hours, notes? }
 *     201 on success; 400/404/409 on validation/missing/duplicate.
 *
 * - GET: list time entries with optional ?status filter (T14 AC-5).
 *     Default (no ?status) returns every entry across statuses.
 *     ?employee_id additionally narrows to one employee.
 */

import { type NextRequest } from 'next/server';

import type { RegisterTimeEntryDto, ListTimeEntriesDto } from '@/application/dtos/timeEntry.dto';
import { TIME_ENTRY_STATUSES, type TimeEntryStatus } from '@/domain/entities/TimeEntry';
import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  errorResponse,
  handleError,
  successResponse,
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
    return handleError(err);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const statusParam = request.nextUrl.searchParams.get('status');
    const employeeParam = request.nextUrl.searchParams.get('employee_id');

    const dto: ListTimeEntriesDto = {};
    if (statusParam !== null && statusParam !== '') {
      if (!TIME_ENTRY_STATUSES.includes(statusParam as TimeEntryStatus)) {
        return errorResponse(
          `status must be one of ${TIME_ENTRY_STATUSES.join(', ')}.`,
          'VALIDATION_ERROR',
          400,
        );
      }
      dto.status = statusParam as TimeEntryStatus;
    }
    if (employeeParam !== null && employeeParam !== '') {
      dto.employeeId = employeeParam;
    }

    const result = await container.listTimeEntries.execute(dto);
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
