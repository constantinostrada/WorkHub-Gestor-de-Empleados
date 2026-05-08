/**
 * PrismaDepartmentRepository — Infrastructure Implementation
 *
 * Implements IDepartmentRepository using Prisma ORM + PostgreSQL.
 */

import type { Prisma } from '@prisma/client';

import { Department } from '@/domain/entities/Department';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IDepartmentRepository } from '@/domain/repositories/IDepartmentRepository';

import type { PrismaClient } from '@prisma/client';

type DepartmentRow = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaDepartmentRepository implements IDepartmentRepository {
  constructor(private readonly db: PrismaClient) {}

  private toDomain(row: DepartmentRow): Department {
    return Department.create({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findById(id: string): Promise<Department | null> {
    const row = await this.db.department.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByName(name: string): Promise<Department | null> {
    const row = await this.db.department.findUnique({ where: { name } });
    return row ? this.toDomain(row) : null;
  }

  async findAll(): Promise<Department[]> {
    const rows = await this.db.department.findMany({ orderBy: { name: 'asc' } });
    return rows.map((r) => this.toDomain(r));
  }

  async save(department: Department): Promise<void> {
    const data: Prisma.DepartmentCreateInput = {
      id: department.id,
      name: department.name,
      description: department.description,
    };
    await this.db.department.create({ data });
  }

  async update(department: Department): Promise<void> {
    const exists = await this.db.department.findUnique({ where: { id: department.id } });
    if (!exists) {
      throw new DomainNotFoundError('Department', department.id);
    }
    await this.db.department.update({
      where: { id: department.id },
      data: {
        name: department.name,
        description: department.description,
        updatedAt: department.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.department.delete({ where: { id } });
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.db.department.count({ where: { id } });
    return count > 0;
  }
}
