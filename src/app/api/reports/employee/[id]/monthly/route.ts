/**
 * GET /api/reports/employee/:id/monthly?year=YYYY
 *
 * Returns a 12-element array (one row per calendar month) with the hours
 * worked and APPROVED vacation days falling inside that month, suitable for
 * a heatmap visualisation. Every month is present even when empty.
 *
 *   - 400 when year is missing or malformed
 *   - 404 when the employee does not exist
 *   - 200 with [{ month: 1..12, hours_worked, vacation_days }]
 */

import { type NextRequest } from 'next/server';

import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import { container } from '@/infrastructure/container/container';
import { handleError, successResponse } from '@/interfaces/http/helpers/apiResponse';
import { withRole } from '@/interfaces/http/helpers/withRole';

const YEAR_PATTERN = /^\d{4}$/;

interface RouteContext {
  params: { id: string };
}

export const GET = withRole(['admin', 'manager'])(async (
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> => {
  try {
    const yearParam = request.nextUrl.searchParams.get('year');
    if (!yearParam) {
      throw new DomainValidationError('Query param "year" is required (YYYY).');
    }
    if (!YEAR_PATTERN.test(yearParam)) {
      throw new DomainValidationError('Query param "year" must match YYYY.');
    }

    const includeOffboarded =
      request.nextUrl.searchParams.get('include_offboarded') === 'true';
    const result = await container.getEmployeeMonthlyReport.execute({
      employeeId: params.id,
      year: Number(yearParam),
      includeOffboarded,
    });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
});
