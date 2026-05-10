/**
 * GET /api/vacations/calendar?year=YYYY&month=MM[&area_id=...] (T8 AC-1..6)
 *
 * Returns the per-day vacation grid for one calendar month, listing every
 * employee whose PENDING or APPROVED vacation overlaps each day. Cross-month
 * vacations are clipped at the month boundaries; days with no vacationing
 * employees still appear with employees: [].
 */

import { type NextRequest } from 'next/server';

import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import { container } from '@/infrastructure/container/container';
import {
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';

const YEAR_RE = /^\d{4}$/;
const MONTH_RE = /^(0[1-9]|1[0-2])$/;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const url = new URL(request.url);
    const yearRaw = url.searchParams.get('year');
    const monthRaw = url.searchParams.get('month');
    const areaIdRaw = url.searchParams.get('area_id');

    if (!yearRaw || !YEAR_RE.test(yearRaw)) {
      throw new DomainValidationError('year query param is required and must be YYYY.');
    }
    if (!monthRaw || !MONTH_RE.test(monthRaw)) {
      throw new DomainValidationError('month query param is required and must be MM (01-12).');
    }

    const result = await container.getVacationCalendar.execute({
      year: parseInt(yearRaw, 10),
      month: parseInt(monthRaw, 10),
      ...(areaIdRaw ? { areaId: areaIdRaw } : {}),
    });

    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
