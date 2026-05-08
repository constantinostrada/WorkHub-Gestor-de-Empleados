/**
 * GET  /api/departments  — list all departments
 * POST /api/departments  — create a department
 */

import { type NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { createDepartmentSchema } from '@/interfaces/http/validation/departmentValidation';

export async function GET(): Promise<Response> {
  try {
    const result = await container.listDepartments.execute();
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = createDepartmentSchema.safeParse(body);

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const result = await container.createDepartment.execute(parsed.data);
    return createdResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
