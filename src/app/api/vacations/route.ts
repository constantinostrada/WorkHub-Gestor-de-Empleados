/**
 * POST /api/vacations — create a vacation request
 *
 * Body: { employee_id, start_date, end_date, reason? }
 * Side effect: writes an audit_logs row { actor_id (from x-actor-id header),
 *   action: 'create', resource_type: 'vacation', resource_id, details_json }
 */

import { type NextRequest } from 'next/server';

import type { CreateVacationDto } from '@/application/dtos/vacation.dto';
import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  handleError,
} from '@/interfaces/http/helpers/apiResponse';
import { actorIdFromRequest, recordAudit } from '@/interfaces/http/helpers/auditHelper';
import { apiCreateVacationSchema } from '@/interfaces/http/validation/vacationValidation';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = apiCreateVacationSchema.safeParse(body);

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const dto: CreateVacationDto = {
      employeeId: parsed.data.employee_id,
      startDate:  parsed.data.start_date,
      endDate:    parsed.data.end_date,
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
    };

    const result = await container.createVacation.execute(dto);

    await recordAudit({
      actorId: actorIdFromRequest(request),
      action: 'create',
      resourceType: 'vacation',
      resourceId: result.id,
      detailsJson: parsed.data,
    });

    return createdResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
