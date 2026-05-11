/**
 * GET /api/reports/hours-by-area?month=YYYY-MM
 *
 * Returns one row per area with total hours worked during the month
 * and the count of employees currently assigned to the area.
 *   - 400 when the month query param is missing or malformed
 *   - 200 with [{ area_id, area_name, total_hours, employee_count }]
 */

import { type NextRequest } from 'next/server';

import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import { container } from '@/infrastructure/container/container';
import { handleError, successResponse } from '@/interfaces/http/helpers/apiResponse';
import { withRole } from '@/interfaces/http/helpers/withRole';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const GET = withRole(['admin', 'manager'])(async (request: NextRequest): Promise<Response> => {
  try {
    const monthParam = request.nextUrl.searchParams.get('month');
    if (!monthParam) {
      throw new DomainValidationError('Query param "month" is required (YYYY-MM).');
    }
    const match = MONTH_PATTERN.exec(monthParam);
    if (!match) {
      throw new DomainValidationError('Query param "month" must match YYYY-MM.');
    }

    const includeOffboarded =
      request.nextUrl.searchParams.get('include_offboarded') === 'true';
    const result = await container.hoursByAreaReport.execute({
      year: Number(match[1]),
      month: Number(match[2]),
      includeOffboarded,
    });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
});
