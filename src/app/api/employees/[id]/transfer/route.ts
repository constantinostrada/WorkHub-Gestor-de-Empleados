/**
 * POST /api/employees/:id/transfer — T18
 *
 * Moves an employee across areas. Admin-only.
 *
 * Body: { new_area_id: string, effective_date?: ISO-8601 }
 * effective_date defaults to "now" when omitted.
 *
 * Errors:
 *   - 404 NOT_FOUND          Employee id is unknown
 *   - 404 AREA_NOT_FOUND     Target area id is unknown
 *   - 422 EMPLOYEE_OFFBOARDED Employee is offboarded (INACTIVE)
 *   - 422 SAME_AREA          Target area equals current areaId
 */

import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { EmployeeOffboardedError } from '@/domain/errors/EmployeeOffboardedError';
import { SameAreaTransferError } from '@/domain/errors/SameAreaTransferError';
import { container } from '@/infrastructure/container/container';
import {
  errorResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';
import { withRole } from '@/interfaces/http/helpers/withRole';

const transferSchema = z
  .object({
    new_area_id: z.string().min(1),
    effective_date: z.string().min(1).optional(),
  })
  .strict();

interface RouteContext {
  params: { id: string };
}

export const POST = withRole(['admin'])(async (
  request: NextRequest,
  { params }: RouteContext,
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

    const parsed = transferSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, 'VALIDATION_ERROR', 400);
    }

    const { new_area_id, effective_date } = parsed.data;

    let effectiveDate: Date;
    if (effective_date === undefined) {
      effectiveDate = new Date();
    } else {
      effectiveDate = new Date(effective_date);
      if (Number.isNaN(effectiveDate.getTime())) {
        return errorResponse(
          'effective_date must be a valid ISO-8601 date.',
          'VALIDATION_ERROR',
          400,
        );
      }
    }

    let result;
    try {
      result = await container.transferEmployee.execute({
        employeeId: params.id,
        newAreaId: new_area_id,
        effectiveDate,
      });
    } catch (err) {
      if (err instanceof EmployeeOffboardedError) {
        return errorResponse(err.message, 'EMPLOYEE_OFFBOARDED', 422);
      }
      if (err instanceof SameAreaTransferError) {
        return errorResponse(err.message, 'SAME_AREA', 422);
      }
      if (err instanceof DomainNotFoundError && err.resourceType === 'Area') {
        return errorResponse(err.message, 'AREA_NOT_FOUND', 404);
      }
      throw err;
    }

    await recordAuditEntry(request, {
      action: 'employee.transferred',
      resourceType: 'employee',
      resourceId: params.id,
      detailsJson: {
        from_area_id: result.transferred_from,
        to_area_id: result.transferred_to,
        effective_date: result.effective_date,
        affected_vacations_count: result.affected_vacations.length,
        affected_time_entries_count: result.affected_time_entries.length,
      },
    });

    return successResponse(result);
  } catch (err) {
    return handleError(err);
  }
});
