/**
 * PrismaAreaRepository — Infrastructure Implementation
 *
 * Implements IAreaRepository using Prisma ORM + PostgreSQL.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import { Area } from '@/domain/entities/Area';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';

type AreaRow = {
  id: string;
  name: string;
  description: string | null;
  managerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaAreaRepository implements IAreaRepository {
  constructor(private readonly db: PrismaClient) {}

  private toDomain(row: AreaRow): Area {
    return Area.create({
      id: row.id,
      name: row.name,
      description: row.description,
      managerId: row.managerId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findById(id: string): Promise<Area | null> {
    const row = await this.db.area.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByName(name: string): Promise<Area | null> {
    const row = await this.db.area.findUnique({ where: { name } });
    return row ? this.toDomain(row) : null;
  }

  async findAll(): Promise<Area[]> {
    const rows = await this.db.area.findMany({ orderBy: { name: 'asc' } });
    return rows.map((r) => this.toDomain(r));
  }

  async save(area: Area): Promise<void> {
    const data: Prisma.AreaCreateInput = {
      id: area.id,
      name: area.name,
      description: area.description,
      ...(area.managerId ? { manager: { connect: { id: area.managerId } } } : {}),
    };
    await this.db.area.create({ data });
  }

  async update(area: Area): Promise<void> {
    const exists = await this.db.area.findUnique({ where: { id: area.id } });
    if (!exists) {
      throw new DomainNotFoundError('Area', area.id);
    }
    await this.db.area.update({
      where: { id: area.id },
      data: {
        name: area.name,
        description: area.description,
        manager: area.managerId
          ? { connect: { id: area.managerId } }
          : { disconnect: true },
        updatedAt: area.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.area.delete({ where: { id } });
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.db.area.count({ where: { id } });
    return count > 0;
  }
}
