/**
 * GET /api/audit — list audit log entries (T6 AC-2..6).
 *
 * Query params:
 *   since   ISO8601 timestamp filter (created_at >= since)
 *   actor   employee id filter
 *   action  one of create|update|delete
 *   limit   pagination size (default 50, max 200)
 *   offset  pagination offset (default 0)
 *
 * Response: { logs: [...], total: N, has_more: bool }, ordered desc by created_at.
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

    const limitRaw = searchParams.get('limit');
    if (limitRaw !== null) {
      const parsed = Number(limitRaw);
      dto.limit = parsed;
    }

    const offsetRaw = searchParams.get('offset');
    if (offsetRaw !== null) {
      const parsed = Number(offsetRaw);
      dto.offset = parsed;
    }

    const result = await container.listAuditLogs.execute(dto);
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
