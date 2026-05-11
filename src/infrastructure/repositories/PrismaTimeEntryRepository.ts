/**
 * PrismaTimeEntryRepository — Infrastructure Implementation
 *
 * Implements ITimeEntryRepository using Prisma ORM + PostgreSQL.
 * Maps Prisma rows → domain entities. ORM types never leak out.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import { TimeEntry, type TimeEntryStatus } from '@/domain/entities/TimeEntry';
import type {
  FindTimeEntriesFilter,
  ITimeEntryRepository,
} from '@/domain/repositories/ITimeEntryRepository';

type TimeEntryRow = {
  id: string;
  employeeId: string;
  date: Date;
  hours: Prisma.Decimal;
  notes: string | null;
  status: TimeEntryStatus;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaTimeEntryRepository implements ITimeEntryRepository {
  constructor(private readonly db: PrismaClient) {}

  // ── Mapping ──────────────────────────────────────────────────────────────

  private toDomain(row: TimeEntryRow): TimeEntry {
    return TimeEntry.create({
      id: row.id,
      employeeId: row.employeeId,
      date: row.date,
      hours: Number(row.hours),
      notes: row.notes,
      status: row.status,
      approvedAt: row.approvedAt,
      approvedBy: row.approvedBy,
      rejectedAt: row.rejectedAt,
      rejectedBy: row.rejectedBy,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  /** Truncate to UTC date-only — matches domain TimeEntry's canonical form. */
  private dateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // ── ITimeEntryRepository ─────────────────────────────────────────────────

  async save(entry: TimeEntry): Promise<void> {
    await this.db.timeEntry.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        employeeId: entry.employeeId,
        date: entry.date,
        hours: entry.hours,
        notes: entry.notes,
        status: entry.status,
        approvedAt: entry.approvedAt,
        approvedBy: entry.approvedBy,
        rejectedAt: entry.rejectedAt,
        rejectedBy: entry.rejectedBy,
        rejectionReason: entry.rejectionReason,
      },
      update: {
        hours: entry.hours,
        notes: entry.notes,
        status: entry.status,
        approvedAt: entry.approvedAt,
        approvedBy: entry.approvedBy,
        rejectedAt: entry.rejectedAt,
        rejectedBy: entry.rejectedBy,
        rejectionReason: entry.rejectionReason,
      },
    });
  }

  async findByEmployeeAndDate(employeeId: string, date: Date): Promise<TimeEntry | null> {
    const row = await this.db.timeEntry.findUnique({
      where: { employeeId_date: { employeeId, date: this.dateOnly(date) } },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByEmployeeInRange(employeeId: string, from: Date, to: Date): Promise<TimeEntry[]> {
    const rows = await this.db.timeEntry.findMany({
      where: {
        employeeId,
        date: {
          gte: this.dateOnly(from),
          lte: this.dateOnly(to),
        },
      },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findById(id: string): Promise<TimeEntry | null> {
    const row = await this.db.timeEntry.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findAll(filter: FindTimeEntriesFilter = {}): Promise<TimeEntry[]> {
    const rows = await this.db.timeEntry.findMany({
      where: {
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.employeeId !== undefined ? { employeeId: filter.employeeId } : {}),
      },
      orderBy: { date: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }
}
