/**
 * GET  /api/employees  — list employees (paginated + filtered)
 * POST /api/employees  — create a new employee
 *
 * Thin adapter: validate → call use case → serialise response.
 * No business logic here.
 */

import { type NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import {
  createEmployeeSchema,
  listEmployeesSchema,
} from '@/interfaces/http/validation/employeeValidation';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const query = listEmployeesSchema.safeParse({
      departmentId: searchParams.get('departmentId') ?? undefined,
      status:       searchParams.get('status') ?? undefined,
      searchTerm:   searchParams.get('searchTerm') ?? undefined,
      page:         searchParams.get('page') ?? undefined,
      pageSize:     searchParams.get('pageSize') ?? undefined,
    });

    if (!query.success) {
      return handleError(new Error(query.error.message));
    }

    const result = await container.listEmployees.execute(query.data);
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = createEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const result = await container.createEmployee.execute(parsed.data);
    return createdResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
