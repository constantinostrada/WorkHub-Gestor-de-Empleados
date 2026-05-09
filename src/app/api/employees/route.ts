/**
 * GET  /api/employees       — list employees, optionally filtered by ?area_id=X (AC-5)
 * POST /api/employees       — create an employee from { name, email, role } (AC-1)
 *
 * Thin adapter: validate → translate → call use case → serialise.
 * Business rules live in the domain / application layers.
 */

import { type NextRequest } from 'next/server';

import type { CreateEmployeeDto } from '@/application/dtos/employee.dto';
import { container } from '@/infrastructure/container/container';
import {
  createdResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { actorIdFromRequest, recordAudit } from '@/interfaces/http/helpers/auditHelper';
import {
  apiCreateEmployeeSchema,
  apiListEmployeesSchema,
} from '@/interfaces/http/validation/employeeValidation';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * AC-1 only mandates a single `name` field.  The rich domain entity expects
 * firstName / lastName, so we split on the first whitespace.  When the input
 * is a single word we use it as firstName and leave a single-character
 * placeholder for lastName (the domain forbids empty strings).
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0] ?? trimmed;
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '-';
  return { firstName, lastName };
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const areaIdParam = searchParams.get('area_id') ?? undefined;

    const parsed = apiListEmployeesSchema.safeParse({ area_id: areaIdParam });
    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const result = await container.listEmployees.execute({
      ...(parsed.data.area_id !== undefined ? { areaId: parsed.data.area_id } : {}),
    });
    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = apiCreateEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return handleError(new Error(parsed.error.message));
    }

    const { name, email, role } = parsed.data;
    const { firstName, lastName } = splitName(name);

    // Translate the AC body to the rich CreateEmployeeDto expected by the
    // existing use case.  Defaults satisfy domain invariants while keeping
    // the public contract narrow.
    const dto: CreateEmployeeDto = {
      firstName,
      lastName,
      email,
      position: role,
      salary: 0.01,                         // Money requires a positive amount
      hireDate: new Date().toISOString(),
      areaId: null,                         // AC-1: created without an area
    };

    const result = await container.createEmployee.execute(dto);

    await recordAudit({
      actorId: actorIdFromRequest(request),
      action: 'create',
      resourceType: 'employee',
      resourceId: result.id,
      detailsJson: parsed.data,
    });

    return createdResponse(result);
  } catch (err) {
    return handleError(err);
  }
}
