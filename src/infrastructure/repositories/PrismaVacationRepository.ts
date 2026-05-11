/**
 * PrismaVacationRepository — Infrastructure Implementation
 *
 * Implements IVacationRepository using Prisma ORM + PostgreSQL.
 * Maps Prisma rows → domain entities. ORM types never leak out.
 */

import type { PrismaClient, VacationStatus as PrismaVacationStatus } from '@prisma/client';

import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

type VacationRow = {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
  status: PrismaVacationStatus;
  reason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaVacationRepository implements IVacationRepository {
  constructor(private readonly db: PrismaClient) {}

  private toDomain(row: VacationRow): Vacation {
    return Vacation.create({
      id: row.id,
      employeeId: row.employeeId,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status as VacationStatus,
      reason: row.reason,
      cancelledAt: row.cancelledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private dateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  async save(vacation: Vacation): Promise<void> {
    await this.db.vacation.upsert({
      where: { id: vacation.id },
      create: {
        id: vacation.id,
        employeeId: vacation.employeeId,
        startDate: vacation.startDate,
        endDate: vacation.endDate,
        status: vacation.status,
        reason: vacation.reason,
        cancelledAt: vacation.cancelledAt,
      },
      update: {
        startDate: vacation.startDate,
        endDate: vacation.endDate,
        status: vacation.status,
        reason: vacation.reason,
        cancelledAt: vacation.cancelledAt,
      },
    });
  }

  async findById(id: string): Promise<Vacation | null> {
    const row = await this.db.vacation.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByEmployeeOverlapping(
    employeeId: string,
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
  ): Promise<Vacation[]> {
    const rows = await this.db.vacation.findMany({
      where: {
        employeeId,
        startDate: { lte: this.dateOnly(to) },
        endDate: { gte: this.dateOnly(from) },
        ...(statuses && statuses.length > 0
          ? { status: { in: statuses as PrismaVacationStatus[] } }
          : {}),
      },
      orderBy: { startDate: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findOverlapping(
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
    areaId?: string,
  ): Promise<Vacation[]> {
    const rows = await this.db.vacation.findMany({
      where: {
        startDate: { lte: this.dateOnly(to) },
        endDate: { gte: this.dateOnly(from) },
        ...(statuses && statuses.length > 0
          ? { status: { in: statuses as PrismaVacationStatus[] } }
          : {}),
        ...(areaId !== undefined ? { employee: { areaId } } : {}),
      },
      orderBy: { startDate: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }
}
