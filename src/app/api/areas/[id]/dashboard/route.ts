/**
 * GET /api/areas/[id]/dashboard — Aggregated metrics for an Area over a date range.
 *
 * Gated by withRole(['admin','manager']). Required query params: `from` and
 * `to` (ISO date strings, inclusive). Returns 400 with code MISSING_DATE_RANGE
 * if either is absent or unparseable, and 404 with code AREA_NOT_FOUND when
 * the area does not exist.
 */

import { type NextRequest } from 'next/server';

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { container } from '@/infrastructure/container/container';
import {
  errorResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { withRole } from '@/interfaces/http/helpers/withRole';

interface RouteContext {
  params: { id: string };
}

export const GET = withRole(['admin', 'manager'])(async (
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> => {
  try {
    const fromParam = request.nextUrl.searchParams.get('from');
    const toParam = request.nextUrl.searchParams.get('to');

    if (!fromParam || !toParam) {
      return errorResponse(
        'Query params "from" and "to" are required ISO dates.',
        'MISSING_DATE_RANGE',
        400,
      );
    }

    const from = new Date(fromParam);
    const to = new Date(toParam);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return errorResponse(
        'Query params "from" and "to" must be valid ISO dates.',
        'MISSING_DATE_RANGE',
        400,
      );
    }

    try {
      const result = await container.areaDashboard.execute({
        areaId: params.id,
        from,
        to,
      });
      return successResponse(result);
    } catch (err) {
      if (err instanceof DomainNotFoundError && err.resourceType === 'Area') {
        return errorResponse(err.message, 'AREA_NOT_FOUND', 404);
      }
      throw err;
    }
  } catch (err) {
    return handleError(err);
  }
});
