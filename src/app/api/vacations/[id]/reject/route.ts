/**
 * POST /api/vacations/:id/reject — transitions PENDING → REJECTED.
 * Optional body { reason?: string }. Reads optional X-Actor-Id header
 * as the approver. Fires vacation.rejected notification (fire-and-forget).
 */

import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { container } from '@/infrastructure/container/container';
import {
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';

const rejectSchema = z
  .object({ reason: z.string().optional() })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    let reason: string | undefined;
    const text = await request.text();
    if (text.trim().length > 0) {
      const parsed = rejectSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return handleError(new Error(parsed.error.message));
      }
      reason = parsed.data.reason;
    }

    const actorHeader = request.headers.get('x-actor-id');
    const approverId = actorHeader && actorHeader.trim() !== '' ? actorHeader : null;

    const result = await container.rejectVacation.execute({
      vacationId: params.id,
      approverId,
      ...(reason !== undefined ? { reason } : {}),
    });

    await recordAuditEntry(request, {
      action: 'update',
      resourceType: 'vacation',
      resourceId: result.id,
      detailsJson: {
        transition: 'reject',
        ...(reason !== undefined ? { reason } : {}),
      },
    });

    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
