/**
 * GET /api/audit
 *
 * Query params:
 *   - since   ISO 8601 timestamp                 → filter createdAt >= since
 *   - actor   employee id                        → filter actorId
 *   - action  one of: create | update | delete   → filter action
 *   - limit   default 50, max 200
 *   - offset  default 0
 *
 * Response:
 *   { logs: AuditLogResponseDto[], total: number, has_more: boolean }
 */

import { type NextRequest } from 'next/server';

import type { ListAuditLogsDto } from '@/application/dtos/audit.dto';
import { container } from '@/infrastructure/container/container';
import { handleError, successResponse } from '@/interfaces/http/helpers/apiResponse';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const dto: ListAuditLogsDto = {};

    const since = searchParams.get('since');
    if (since !== null) dto.since = since;

    const actor = searchParams.get('actor');
    if (actor !== null) dto.actor = actor;

    const action = searchParams.get('action');
    if (action !== null) dto.action = action;

    const limitParam = searchParams.get('limit');
    if (limitParam !== null) {
      const parsed = Number(limitParam);
      if (!Number.isFinite(parsed)) {
        return handleError(new Error("'limit' must be a number"));
      }
      dto.limit = parsed;
    }

    const offsetParam = searchParams.get('offset');
    if (offsetParam !== null) {
      const parsed = Number(offsetParam);
      if (!Number.isFinite(parsed)) {
        return handleError(new Error("'offset' must be a number"));
      }
      dto.offset = parsed;
    }

    const result = await container.listAuditLogs.execute(dto);
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
