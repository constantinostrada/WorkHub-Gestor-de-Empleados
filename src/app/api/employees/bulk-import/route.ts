/**
 * POST /api/employees/bulk-import — T7
 *
 * Accepts multipart/form-data with a single `file` field containing CSV
 * (headers: name,email,role,area_name?,salary?). Validates every row, then
 * either persists them all atomically or rejects the whole batch.
 *
 * Response shape: { imported: number, errors: [{row, field, message}] }
 */

import { type NextRequest } from 'next/server';

import { container } from '@/infrastructure/container/container';
import {
  errorResponse,
  handleError,
  successResponse,
} from '@/interfaces/http/helpers/apiResponse';
import { recordAuditEntry } from '@/interfaces/http/helpers/auditLog';
import { CsvParseError, parseCsv } from '@/interfaces/http/helpers/csvParser';

import type { BulkImportRowInput } from '@/application/use-cases/employee/BulkImportEmployeesUseCase';

const ALLOWED_HEADERS = new Set(['name', 'email', 'role', 'area_name', 'salary']);
const REQUIRED_HEADERS = ['name', 'email', 'role'] as const;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return errorResponse(
        'Expected multipart/form-data with a CSV file under the "file" field.',
        'VALIDATION_ERROR',
        400,
      );
    }

    const fileEntry = formData.get('file');
    if (!fileEntry || typeof fileEntry === 'string') {
      return errorResponse(
        'Missing CSV file. Send the CSV under the "file" field of multipart/form-data.',
        'VALIDATION_ERROR',
        400,
      );
    }

    const text = await fileEntry.text();

    let parsed;
    try {
      parsed = parseCsv(text);
    } catch (err) {
      if (err instanceof CsvParseError) {
        return errorResponse(err.message, 'VALIDATION_ERROR', 400);
      }
      throw err;
    }

    const missingRequired = REQUIRED_HEADERS.filter((h) => !parsed.headers.includes(h));
    if (missingRequired.length > 0) {
      return errorResponse(
        `CSV is missing required header(s): ${missingRequired.join(', ')}.`,
        'VALIDATION_ERROR',
        400,
      );
    }

    const unknownHeaders = parsed.headers.filter((h) => !ALLOWED_HEADERS.has(h));
    if (unknownHeaders.length > 0) {
      return errorResponse(
        `CSV contains unknown header(s): ${unknownHeaders.join(', ')}. Allowed: ${[...ALLOWED_HEADERS].join(', ')}.`,
        'VALIDATION_ERROR',
        400,
      );
    }

    const rows: BulkImportRowInput[] = parsed.rows.map((r) => ({
      ...(r.name !== undefined ? { name: r.name } : {}),
      ...(r.email !== undefined ? { email: r.email } : {}),
      ...(r.role !== undefined ? { role: r.role } : {}),
      ...(r.area_name !== undefined ? { area_name: r.area_name } : {}),
      ...(r.salary !== undefined ? { salary: r.salary } : {}),
    }));

    const result = await container.bulkImportEmployees.execute(rows);

    if (result.imported > 0) {
      await recordAuditEntry(request, {
        action: 'create',
        resourceType: 'employee',
        resourceId: 'bulk-import',
        detailsJson: { imported: result.imported },
      });
    }

    return successResponse(result, 200);
  } catch (err) {
    return handleError(err);
  }
}
