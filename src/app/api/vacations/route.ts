/**
 * /api/vacations route handlers
 *
 * POST   — create a new vacation request in PENDING status (AC-1, AC-2, AC-3)
 *          Body: { employee_id, start_date, end_date, reason? }
 *          - 400 when body shape / date range is invalid
 *          - 404 when employee_id does not exist
 *          - 409 when range overlaps an existing PENDING/APPROVED vacation
 *          - 201 on success
 *
 * GET    — list vacations filtered by status (AC-6)
 *          Query: ?status=pending|approved|rejected (default: pending)
 *          - 400 when status param is malformed
 *          - 200 with array of vacations including embedded employee summary
 */

import { type NextRequest } from 'next/server';

import type {
  CreateVacationDto,
  ListVacationsDto,
} from '@/application/dtos/vacation.dto';
import type { VacationStatus } from '@/domain/entities/Vacation';
import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import {
  apiCreateVacationSchema,
  apiListVacationsSchema,
} from '@/interfaces/http/validation/vacationValidation';

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
    return createdResponse(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const parsed = apiListVacationsSchema.safeParse({
      status: searchParams.get('status') ?? undefined,
    });

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const dto: ListVacationsDto = {};
    if (parsed.data.status) {
      dto.status = parsed.data.status.toUpperCase() as VacationStatus;
    }

    const result = await container.listVacations.execute(dto);
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
