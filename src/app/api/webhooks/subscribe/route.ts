/**
 * POST /api/webhooks/subscribe — register an outbound webhook subscription.
 *
 * Auth: admin only (T17 AC-1).
 * Body: { callback_url: string, events: string[] }
 * Response (201): { id, callback_url, events, created_at, secret }
 *
 * Errors:
 *   422 INVALID_EVENT  — any event not in the WEBHOOK_EVENTS whitelist
 *   422 INSECURE_URL   — non-HTTPS callback_url (except http://localhost in dev)
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { InsecureWebhookUrlError } from '@/domain/errors/InsecureWebhookUrlError';
import { InvalidWebhookEventError } from '@/domain/errors/InvalidWebhookEventError';
import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  errorResponse,
  handleError,
} from '@/interfaces/http/helpers/apiResponse';
import { withRole } from '@/interfaces/http/helpers/withRole';

const subscribeBodySchema = z
  .object({
    callback_url: z.string().min(1),
    events: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const POST = withRole(['admin'])(async (request: NextRequest): Promise<Response> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 'VALIDATION_ERROR', 400);
  }

  const parsed = subscribeBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Invalid request body', 'VALIDATION_ERROR', 400, parsed.error.flatten());
  }

  try {
    const sub = await container.subscribeWebhook.execute({
      callbackUrl: parsed.data.callback_url,
      events: parsed.data.events,
    });
    return createdResponse(sub);
  } catch (err) {
    if (err instanceof InvalidWebhookEventError) {
      return errorResponse(
        `Unknown event: ${err.invalidEvent}`,
        'INVALID_EVENT',
        422,
      );
    }
    if (err instanceof InsecureWebhookUrlError) {
      return errorResponse(
        `callback_url must use https: ${err.url}`,
        'INSECURE_URL',
        422,
      );
    }
    return handleError(err);
  }
});
