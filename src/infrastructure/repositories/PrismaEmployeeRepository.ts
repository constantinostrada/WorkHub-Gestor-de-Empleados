/**
 * PrismaEmployeeRepository — Infrastructure Implementation
 *
 * Implements IEmployeeRepository using Prisma ORM + PostgreSQL.
 * Maps Prisma models → domain entities and vice-versa.
 *
 * Business logic is FORBIDDEN here.
 * ORM types NEVER leave this file.
 */

import type { Prisma } from '@prisma/client';

import { Employee } from '@/domain/entities/Employee';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type {
  FindEmployeesFilter,
  IEmployeeRepository,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';
import { DEFAULT_ROLE, isValidRole, type Role } from '@/domain/value-objects/Role';

import type { PrismaClient } from '@prisma/client';

// ── Type alias for the Prisma row shape ────────────────────────────────────
type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  position: string;
  salary: Prisma.Decimal;
  status: string;
  hireDate: Date;
  areaId: string | null;
  role: string;
  offboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaEmployeeRepository implements IEmployeeRepository {
  constructor(private readonly db: PrismaClient) {}

  // ── Mapping ──────────────────────────────────────────────────────────────

  private toDomain(row: EmployeeRow): Employee {
    const statusValue = row.status as EmployeeStatus;
    const roleValue: Role = isValidRole(row.role) ? row.role : DEFAULT_ROLE;

    return Employee.create({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: Email.create(row.email),
      phone: row.phone,
      position: row.position,
      salary: Money.create(Number(row.salary), 'EUR'),
      status: statusValue,
      hireDate: row.hireDate,
      areaId: row.areaId,
      role: roleValue,
      offboardedAt: row.offboardedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toCreateInput(employee: Employee): Prisma.EmployeeCreateInput {
    return {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email.value,
      phone: employee.phone,
      position: employee.position,
      salary: employee.salary.amount,
      status: employee.status,
      role: employee.role,
      hireDate: employee.hireDate,
      offboardedAt: employee.offboardedAt,
      ...(employee.areaId
        ? { area: { connect: { id: employee.areaId } } }
        : {}),
    };
  }

  private toUpdateInput(employee: Employee): Prisma.EmployeeUpdateInput {
    return {
      firstName: employee.firstName,
      lastName: employee.lastName,
      phone: employee.phone,
      position: employee.position,
      salary: employee.salary.amount,
      status: employee.status,
      role: employee.role,
      offboardedAt: employee.offboardedAt,
      area: employee.areaId
        ? { connect: { id: employee.areaId } }
        : { disconnect: true },
      updatedAt: employee.updatedAt,
    };
  }

  // ── IEmployeeRepository ──────────────────────────────────────────────────

  async findById(id: string): Promise<Employee | null> {
    const row = await this.db.employee.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<Employee | null> {
    const row = await this.db.employee.findUnique({ where: { email } });
    return row ? this.toDomain(row) : null;
  }

  async findAll(
    filter: FindEmployeesFilter = {},
    pagination: PaginationOptions = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<Employee>> {
    const where: Prisma.EmployeeWhereInput = {};

    if (filter.areaId) {
      where.areaId = filter.areaId;
    }
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.searchTerm) {
      const term = filter.searchTerm;
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName:  { contains: term, mode: 'insensitive' } },
        { email:     { contains: term, mode: 'insensitive' } },
      ];
    }
    if (!filter.includeOffboarded) {
      where.offboardedAt = null;
    }

    const skip = (pagination.page - 1) * pagination.pageSize;
    const take = pagination.pageSize;

    const [rows, total] = await Promise.all([
      this.db.employee.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.db.employee.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toDomain(r)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.ceil(total / pagination.pageSize),
    };
  }

  async save(employee: Employee): Promise<void> {
    await this.db.employee.create({ data: this.toCreateInput(employee) });
  }

  async update(employee: Employee): Promise<void> {
    const exists = await this.db.employee.findUnique({ where: { id: employee.id } });
    if (!exists) {
      throw new DomainNotFoundError('Employee', employee.id);
    }
    await this.db.employee.update({
      where: { id: employee.id },
      data: this.toUpdateInput(employee),
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.employee.delete({ where: { id } });
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.db.employee.count({ where: { email } });
    return count > 0;
  }
}
