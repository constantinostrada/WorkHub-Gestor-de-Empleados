/**
 * POST /api/vacations — create a vacation request from
 * { employee_id, start_date, end_date, reason? } (T6 AC-1).
 */

import { type NextRequest } from 'next/server';
import { z } from 'zod';

import type { CreateVacationDto } from '@/application/dtos/vacation.dto';
import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  handleError,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';
import { withRole } from '@/interfaces/http/helpers/withRole';

const apiCreateVacationSchema = z.object({
  employee_id: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  reason: z.string().optional(),
}).strict();

export const POST = withRole(['admin', 'manager'])(async (request: NextRequest): Promise<Response> => {
  try {
    const body: unknown = await request.json();
    const parsed = apiCreateVacationSchema.safeParse(body);
    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const dto: CreateVacationDto = {
      employeeId: parsed.data.employee_id,
      startDate: parsed.data.start_date,
      endDate: parsed.data.end_date,
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
    };

    const result = await container.createVacation.execute(dto);
    await recordAuditEntry(request, {
      action: 'create',
      resourceType: 'vacation',
      resourceId: result.id,
      detailsJson: {
        employee_id: parsed.data.employee_id,
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
        ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
      },
    });
    return createdResponse(result);
  } catch (err) {
    return handleError(err);
  }
});
