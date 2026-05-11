/**
 * DELETE /api/webhooks/:id — cancel a webhook subscription (admin, T17 AC-6).
 *
 * Idempotent: an unknown id returns 404 (with a clean body) rather than 500
 * or 204. A successful delete returns 204 No Content.
 */

import type { NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import {
  errorResponse,
  handleError,
  noContentResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { withRole } from '@/interfaces/http/helpers/withRole';

export const DELETE = withRole(['admin'])(async (
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> => {
  try {
    const { deleted } = await container.deleteWebhook.execute({ id: params.id });
    if (!deleted) {
      return errorResponse(
        `Webhook subscription "${params.id}" not found`,
        'NOT_FOUND',
        404,
      );
    }
    return noContentResponse();
  } catch (err) {
    return handleError(err);
  }
});
