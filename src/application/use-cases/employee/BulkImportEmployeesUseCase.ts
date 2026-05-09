/**
 * BulkImportEmployeesUseCase
 *
 * Validates every input row before persisting. If any row fails validation
 * (RFC-style email, role enum, area_name lookup, intra-CSV email duplicates,
 * existing-email collisions), the entire batch is rejected and zero rows
 * are written. Successful imports are persisted via
 * IEmployeeRepository.saveMany, which the Prisma impl wraps in a single
 * transaction so a runtime DB error rolls everything back.
 */

import { Employee } from '@/domain/entities/Employee';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';

import { generateId } from '../../utils/generateId';

export interface BulkImportRowInput {
  name?: string;
  email?: string;
  role?: string;
  area_name?: string;
  salary?: string;
}

export interface BulkImportRowError {
  row: number;
  field: string;
  message: string;
}

export interface BulkImportEmployeesResult {
  imported: number;
  errors: BulkImportRowError[];
}

const VALID_ROLES = ['employee', 'manager', 'admin'] as const;
type ValidRole = typeof VALID_ROLES[number];

// RFC-5322-style — same regex used by the project Email VO with a bit more
// permissive local-part to match the AC wording. We still defer to Email VO
// at construction time so behaviour stays consistent with other endpoints.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class BulkImportEmployeesUseCase {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly areaRepository: IAreaRepository,
  ) {}

  async execute(rows: BulkImportRowInput[]): Promise<BulkImportEmployeesResult> {
    const errors: BulkImportRowError[] = [];
    const validated: Array<{ row: number; input: BulkImportRowInput; areaId: string | null; salary: number }> = [];
    const seenEmails = new Map<string, number>();

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 1;
      const raw = rows[i] ?? {};
      const rowErrors: BulkImportRowError[] = [];

      const name = (raw.name ?? '').trim();
      if (!name) {
        rowErrors.push({ row: rowNumber, field: 'name', message: 'Name is required.' });
      }

      const emailRaw = (raw.email ?? '').trim();
      let normalisedEmail = '';
      if (!emailRaw) {
        rowErrors.push({ row: rowNumber, field: 'email', message: 'Email is required.' });
      } else if (!EMAIL_REGEX.test(emailRaw)) {
        rowErrors.push({ row: rowNumber, field: 'email', message: `"${emailRaw}" is not a valid email address.` });
      } else {
        normalisedEmail = emailRaw.toLowerCase();
        const previousRow = seenEmails.get(normalisedEmail);
        if (previousRow !== undefined) {
          rowErrors.push({
            row: rowNumber,
            field: 'email',
            message: `Duplicate email "${normalisedEmail}" within CSV (also present at row ${previousRow}).`,
          });
        } else {
          seenEmails.set(normalisedEmail, rowNumber);
        }
      }

      const roleRaw = (raw.role ?? '').trim();
      if (!roleRaw) {
        rowErrors.push({ row: rowNumber, field: 'role', message: 'Role is required.' });
      } else if (!isValidRole(roleRaw)) {
        rowErrors.push({
          row: rowNumber,
          field: 'role',
          message: `"${roleRaw}" is not a valid role. Expected one of: ${VALID_ROLES.join(', ')}.`,
        });
      }

      let areaId: string | null = null;
      const areaNameRaw = (raw.area_name ?? '').trim();
      if (areaNameRaw) {
        const area = await this.areaRepository.findByName(areaNameRaw);
        if (!area) {
          rowErrors.push({
            row: rowNumber,
            field: 'area_name',
            message: `Area "${areaNameRaw}" does not exist.`,
          });
        } else {
          areaId = area.id;
        }
      }

      let salary = 0.01;
      const salaryRaw = (raw.salary ?? '').trim();
      if (salaryRaw) {
        const parsed = Number(salaryRaw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          rowErrors.push({
            row: rowNumber,
            field: 'salary',
            message: `"${salaryRaw}" is not a valid non-negative number.`,
          });
        } else {
          salary = parsed;
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      validated.push({
        row: rowNumber,
        input: { ...raw, name, email: normalisedEmail, role: roleRaw },
        areaId,
        salary,
      });
    }

    // AC-6: duplicate emails already in the database reject the entire transaction.
    if (errors.length === 0 && validated.length > 0) {
      const seen = new Set<string>();
      for (const v of validated) {
        const email = (v.input.email ?? '').toLowerCase();
        if (seen.has(email)) continue;
        seen.add(email);
        const exists = await this.employeeRepository.existsByEmail(email);
        if (exists) {
          errors.push({
            row: v.row,
            field: 'email',
            message: `Email "${email}" already exists.`,
          });
        }
      }
    }

    if (errors.length > 0) {
      return { imported: 0, errors };
    }

    const now = new Date();
    const employees: Employee[] = validated.map((v) => {
      const fullName = (v.input.name ?? '').trim();
      const { firstName, lastName } = splitName(fullName);
      const email = Email.create(v.input.email ?? '');
      const money = Money.create(v.salary, 'EUR');
      return Employee.create({
        id: generateId(),
        firstName,
        lastName,
        email,
        phone: null,
        position: v.input.role ?? '',
        salary: money,
        status: EmployeeStatus.ACTIVE,
        hireDate: now,
        areaId: v.areaId,
        createdAt: now,
        updatedAt: now,
      });
    });

    try {
      await this.employeeRepository.saveMany(employees);
    } catch (err) {
      // Mirror AC-4: any persistence failure → rollback completo (the repo
      // implementation already rolls the transaction back). We surface the
      // failure as a domain error so the route maps it to a non-2xx code.
      const message = err instanceof Error ? err.message : 'Bulk import transaction failed.';
      throw new DomainValidationError(`Bulk import rolled back: ${message}`);
    }

    return { imported: employees.length, errors: [] };
  }
}

function isValidRole(value: string): value is ValidRole {
  return (VALID_ROLES as readonly string[]).includes(value);
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0] ?? trimmed;
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '-';
  return { firstName, lastName };
}
