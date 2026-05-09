/**
 * GET /api/areas/:id  — area detail with members (AC-4)
 *
 * Returns: { id, name, description, manager_id, members: [{ id, name, role, joined_at }] }
 * 404 when the id does not match (AC-6) — handled by `handleError`.
 */

import { type NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import { handleError, successResponse } from '@/interfaces/http/helpers/apiResponse';

interface RouteContext {
  params: { id: string };
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const result = await container.getAreaWithMembers.execute({ id: params.id });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
