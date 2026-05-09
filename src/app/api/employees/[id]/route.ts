/**
 * GET    /api/employees/:id  — get a single employee
 * PUT    /api/employees/:id  — assign / unassign an area from `{ area_id }` (AC-3)
 * PATCH  /api/employees/:id  — partial update (rich)
 * DELETE /api/employees/:id  — remove an employee
 */

import { type NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import {
  handleError,
  noContentResponse,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import {
  apiAssignAreaSchema,
  updateEmployeeSchema,
} from '@/interfaces/http/validation/employeeValidation';

interface RouteContext {
  params: { id: string };
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const result = await container.getEmployee.execute({ id: params.id });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = apiAssignAreaSchema.safeParse(body);

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const result = await container.updateEmployee.execute({
      id: params.id,
      areaId: parsed.data.area_id,
    });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = updateEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const result = await container.updateEmployee.execute({
      id: params.id,
      ...parsed.data,
    });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  try {
    await container.deleteEmployee.execute({ id: params.id });
    return noContentResponse();
  } catch (err) {
    return handleError(err);
  }
}
