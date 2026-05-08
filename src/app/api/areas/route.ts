/**
 * GET  /api/areas  — list all areas
 * POST /api/areas  — create an area
 */

import { type NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { createAreaSchema } from '@/interfaces/http/validation/areaValidation';

export async function GET(): Promise<Response> {
  try {
    const result = await container.listAreas.execute();
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = createAreaSchema.safeParse(body);

    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const result = await container.createArea.execute(parsed.data);
    return createdResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
