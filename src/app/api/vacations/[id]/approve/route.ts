/**
 * POST /api/vacations/:id/approve — transitions PENDING → APPROVED.
 * Reads optional X-Actor-Id header as the approver. Fires
 * vacation.approved notification (fire-and-forget).
 */

import { type NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import {
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';
import { withRole } from '@/interfaces/http/helpers/withRole';

export const POST = withRole(['admin', 'manager'])(async (
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> => {
  try {
    const actorHeader = request.headers.get('x-actor-id');
    const approverId = actorHeader && actorHeader.trim() !== '' ? actorHeader : null;

    const result = await container.approveVacation.execute({
      vacationId: params.id,
      approverId,
    });

    await recordAuditEntry(request, {
      action: 'update',
      resourceType: 'vacation',
      resourceId: result.id,
      detailsJson: { transition: 'approve' },
    });

    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
});
