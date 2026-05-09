/**
 * POST /api/vacations/:id/reject — transition a vacation PENDING → REJECTED (AC-4)
 *
 *   - 400 when current status is not PENDING (invalid transition)
 *   - 404 when :id does not exist
 *   - 200 with the updated vacation DTO
 */

import { type NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import { handleError, successResponse } from '@/interfaces/http/helpers/apiResponse';

interface RouteContext {
  params: { id: string };
}

export async function POST(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const result = await container.rejectVacation.execute({
      vacationId: params.id,
    });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
