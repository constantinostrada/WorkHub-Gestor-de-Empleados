/**
 * GET /api/employees/:id/time-entries?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Lists time entries for an employee in the inclusive [from, to] range
 * and returns the total hours summed across them (AC-6, AC-7).
 *   - 400 when from/to query params are missing or malformed
 *   - 404 when employee :id does not exist
 *   - 200 with { entries: [...], total_hours: N }
 */

import { type NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import { handleError, successResponse } from '@/interfaces/http/helpers/apiResponse';
import { apiListTimeEntriesRangeSchema } from '@/interfaces/http/validation/timeEntryValidation';

interface RouteContext {
  params: { id: string };
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const parsed = apiListTimeEntriesRangeSchema.safeParse({
      from: searchParams.get('from') ?? undefined,
      to:   searchParams.get('to') ?? undefined,
    });

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const result = await container.listTimeEntriesByEmployee.execute({
      employeeId: params.id,
      from:       parsed.data.from,
      to:         parsed.data.to,
    });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
