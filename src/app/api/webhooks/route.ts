/**
 * GET /api/webhooks — list webhook subscriptions (admin only, T17 AC-5).
 *
 * Returns { subscriptions: [{ id, callback_url, events, created_at }] }.
 * The secret is intentionally NOT returned here — it is only shown once at
 * subscription creation time.
 */

import type { NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import { handleError, successResponse } from '@/interfaces/http/helpers/apiResponse';
import { withRole } from '@/interfaces/http/helpers/withRole';

export const GET = withRole(['admin'])(async (_request: NextRequest): Promise<Response> => {
  try {
    const result = await container.listWebhooks.execute();
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
});
