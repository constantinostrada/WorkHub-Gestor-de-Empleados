/**
 * PrismaVacationRepository — Infrastructure Implementation
 *
 * Implements IVacationRepository using Prisma ORM + PostgreSQL.
 * Maps Prisma rows → domain entities. ORM types never leak outwards.
 */

import type { PrismaClient } from '@prisma/client';

import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

type VacationRow = {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  status: VacationStatus;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaVacationRepository implements IVacationRepository {
  constructor(private readonly db: PrismaClient) {}

  // ── Mapping ──────────────────────────────────────────────────────────────

  private toDomain(row: VacationRow): Vacation {
    return Vacation.create({
      id: row.id,
      employeeId: row.employeeId,
      startDate: row.startDate,
      endDate: row.endDate,
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  /** Truncate to UTC date-only — matches domain Vacation's canonical form. */
  private dateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // ── IVacationRepository ──────────────────────────────────────────────────

  async save(vacation: Vacation): Promise<void> {
    await this.db.vacation.create({
      data: {
        id: vacation.id,
        employeeId: vacation.employeeId,
        startDate: vacation.startDate,
        endDate: vacation.endDate,
        reason: vacation.reason,
        status: vacation.status,
      },
    });
  }

  async update(vacation: Vacation): Promise<void> {
    await this.db.vacation.update({
      where: { id: vacation.id },
      data: {
        startDate: vacation.startDate,
        endDate: vacation.endDate,
        reason: vacation.reason,
        status: vacation.status,
      },
    });
  }

  async findById(id: string): Promise<Vacation | null> {
    const row = await this.db.vacation.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findOverlapping(
    employeeId: string,
    start: Date,
    end: Date,
    statuses: VacationStatus[],
    excludeId?: string,
  ): Promise<Vacation[]> {
    if (statuses.length === 0) return [];

    const rows = await this.db.vacation.findMany({
      where: {
        employeeId,
        status: { in: statuses },
        // Two ranges overlap when: existing.start <= newEnd AND existing.end >= newStart
        startDate: { lte: this.dateOnly(end) },
        endDate: { gte: this.dateOnly(start) },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findByEmployeeAndYear(employeeId: string, year: number): Promise<Vacation[]> {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const rows = await this.db.vacation.findMany({
      where: {
        employeeId,
        // Vacation touches the year: start <= Dec 31 AND end >= Jan 1
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      orderBy: { startDate: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findByStatus(status: VacationStatus): Promise<Vacation[]> {
    const rows = await this.db.vacation.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }
}
