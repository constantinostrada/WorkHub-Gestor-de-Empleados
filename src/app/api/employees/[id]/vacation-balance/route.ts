/**
 * GET /api/employees/:id/vacation-balance?year=YYYY  (AC-5)
 *
 * Returns the employee's annual vacation budget breakdown:
 *   { employee_id, year, total: 14, used, pending, available }
 *
 *   - 400 when ?year is malformed (non-YYYY)
 *   - 404 when :id does not exist
 *   - 200 with the balance DTO
 *
 * If ?year is omitted, defaults to the current UTC year.
 */

import { type NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import { handleError, successResponse } from '@/interfaces/http/helpers/apiResponse';
import { apiVacationBalanceSchema } from '@/interfaces/http/validation/vacationValidation';

interface RouteContext {
  params: { id: string };
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const parsed = apiVacationBalanceSchema.safeParse({
      year: searchParams.get('year') ?? undefined,
    });

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const year = parsed.data.year
      ? parseInt(parsed.data.year, 10)
      : new Date().getUTCFullYear();

    const result = await container.getVacationBalance.execute({
      employeeId: params.id,
      year,
    });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
