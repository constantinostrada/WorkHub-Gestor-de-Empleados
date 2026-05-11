/**
 * POST /api/vacations/bulk-action — Bulk approve/reject of PENDING vacations
 * filtered by date range + optional area. Returns a per-vacation summary;
 * individual failures do not abort the request. Each succeeded item writes
 * one audit row (action='vacation.approved' | 'vacation.rejected').
 */

import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { container } from '@/infrastructure/container/container';
import {
  errorResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';
import { withRole } from '@/interfaces/http/helpers/withRole';

const bulkSchema = z
  .object({
    filter: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        area_id: z.string().optional(),
        status: z.literal('PENDING').optional(),
      })
      .strict(),
    action: z.enum(['approve', 'reject']),
    reason: z.string().optional(),
  })
  .strict();

export const POST = withRole(['admin', 'manager'])(async (
  request: NextRequest,
): Promise<Response> => {
  try {
    const text = await request.text();
    if (text.trim().length === 0) {
      return errorResponse('Request body is required.', 'VALIDATION_ERROR', 400);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      return errorResponse('Invalid JSON body.', 'VALIDATION_ERROR', 400);
    }

    const parsed = bulkSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, 'VALIDATION_ERROR', 400);
    }

    const { filter, action, reason } = parsed.data;

    if (action === 'reject' && (reason === undefined || reason.trim() === '')) {
      return errorResponse(
        'reason is required when action="reject".',
        'MISSING_REJECT_REASON',
        422,
      );
    }

    const from = new Date(filter.from);
    const to = new Date(filter.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return errorResponse(
        'filter.from and filter.to must be ISO-8601 dates.',
        'VALIDATION_ERROR',
        400,
      );
    }

    let result;
    try {
      result = await container.bulkVacationAction.execute({
        filter: {
          from,
          to,
          ...(filter.area_id !== undefined ? { areaId: filter.area_id } : {}),
          ...(filter.status !== undefined ? { status: filter.status } : {}),
        },
        action,
        ...(reason !== undefined ? { reason } : {}),
      });
    } catch (err) {
      if (err instanceof DomainNotFoundError && err.resourceType === 'Area') {
        return errorResponse(err.message, 'AREA_NOT_FOUND', 404);
      }
      throw err;
    }

    const auditAction =
      action === 'approve' ? 'vacation.approved' : 'vacation.rejected';
    const decidedAt = new Date().toISOString();
    for (const item of result.succeeded) {
      await recordAuditEntry(request, {
        action: auditAction,
        resourceType: 'vacation',
        resourceId: item.vacation_id,
        detailsJson: {
          transition: action,
          new_status: item.new_status,
          decided_at: decidedAt,
          ...(reason !== undefined ? { reason } : {}),
        },
      });
    }

    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
});
