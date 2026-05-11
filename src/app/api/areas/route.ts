/**
 * GET  /api/areas  — list all areas
 * POST /api/areas  — create an area from { name, description?, manager_id? } (AC-2)
 */

import { type NextRequest } from 'next/server';

import type { CreateAreaDto } from '@/application/dtos/area.dto';
import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';
import { withRole } from '@/interfaces/http/helpers/withRole';
import { apiCreateAreaSchema } from '@/interfaces/http/validation/areaValidation';

export async function GET(): Promise<Response> {
  try {
    const result = await container.listAreas.execute();
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}

export const POST = withRole(['admin', 'manager'])(async (request: NextRequest): Promise<Response> => {
  try {
    const body: unknown = await request.json();
    const parsed = apiCreateAreaSchema.safeParse(body);

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const dto: CreateAreaDto = {
      name: parsed.data.name,
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.manager_id !== undefined ? { managerId: parsed.data.manager_id } : {}),
    };

    const result = await container.createArea.execute(dto);
    await recordAuditEntry(request, {
      action: 'create',
      resourceType: 'area',
      resourceId: result.id,
      detailsJson: {
        name: parsed.data.name,
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.manager_id !== undefined ? { manager_id: parsed.data.manager_id } : {}),
      },
    });
    return createdResponse(result);
  } catch (err) {
    return handleError(err);
  }
});
