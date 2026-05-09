/**
 * GET /api/reports/vacations-summary?year=YYYY
 *
 * Returns one row per employee summarising vacation usage during the year:
 *   - days_taken     → APPROVED vacation days inside the year
 *   - days_pending   → PENDING vacation days inside the year
 *   - days_available → 14 minus days_taken (clamped to 0)
 *
 *   - 400 when year is missing or malformed
 *   - 200 with [{ employee_id, name, days_taken, days_pending, days_available }]
 */

import { type NextRequest } from 'next/server';

import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import { container } from '@/infrastructure/container/container';
import { handleError, successResponse } from '@/interfaces/http/helpers/apiResponse';

const YEAR_PATTERN = /^\d{4}$/;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const yearParam = request.nextUrl.searchParams.get('year');
    if (!yearParam) {
      throw new DomainValidationError('Query param "year" is required (YYYY).');
    }
    if (!YEAR_PATTERN.test(yearParam)) {
      throw new DomainValidationError('Query param "year" must match YYYY.');
    }

    const result = await container.vacationsSummaryReport.execute({
      year: Number(yearParam),
    });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
