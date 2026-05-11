/**
 * TimeEntry — Aggregate Root
 *
 * Represents a single day's worked-hours record for an employee.
 * Owns the invariants on hours range and date validity, plus the
 * PENDING → APPROVED | REJECTED state machine (T14).
 */

import { DomainValidationError } from '../errors/DomainValidationError';
import { TimeEntryNotPendingError } from '../errors/TimeEntryNotPendingError';

export type TimeEntryStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const TIME_ENTRY_STATUSES: readonly TimeEntryStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
] as const;

export interface TimeEntryProps {
  id: string;
  employeeId: string;
  date: Date;
  hours: number;
  notes: string | null;
  status: TimeEntryStatus;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TimeEntryCreateInput =
  Omit<TimeEntryProps, 'status' | 'approvedAt' | 'approvedBy' | 'rejectedAt' | 'rejectedBy' | 'rejectionReason'>
  & Partial<Pick<TimeEntryProps, 'status' | 'approvedAt' | 'approvedBy' | 'rejectedAt' | 'rejectedBy' | 'rejectionReason'>>;

export class TimeEntry {
  static readonly MIN_HOURS = 0.5;
  static readonly MAX_HOURS = 16;

  private props: TimeEntryProps;

  private constructor(props: TimeEntryProps) {
    this.props = props;
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static create(input: TimeEntryCreateInput): TimeEntry {
    const props: TimeEntryProps = {
      id: input.id,
      employeeId: input.employeeId,
      date: input.date,
      hours: input.hours,
      notes: input.notes,
      status: input.status ?? 'PENDING',
      approvedAt: input.approvedAt ?? null,
      approvedBy: input.approvedBy ?? null,
      rejectedAt: input.rejectedAt ?? null,
      rejectedBy: input.rejectedBy ?? null,
      rejectionReason: input.rejectionReason ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
    TimeEntry.validate(props);
    return new TimeEntry({ ...props, date: TimeEntry.toDateOnly(props.date) });
  }

  private static validate(props: TimeEntryProps): void {
    if (!props.employeeId.trim()) {
      throw new DomainValidationError('TimeEntry employeeId cannot be empty.');
    }
    if (!Number.isFinite(props.hours)) {
      throw new DomainValidationError('TimeEntry hours must be a finite number.');
    }
    if (props.hours < TimeEntry.MIN_HOURS || props.hours > TimeEntry.MAX_HOURS) {
      throw new DomainValidationError(
        `TimeEntry hours must be between ${TimeEntry.MIN_HOURS} and ${TimeEntry.MAX_HOURS}.`,
      );
    }
    if (TimeEntry.toDateOnly(props.date).getTime() > TimeEntry.toDateOnly(new Date()).getTime()) {
      throw new DomainValidationError('TimeEntry date cannot be in the future.');
    }
    if (!TIME_ENTRY_STATUSES.includes(props.status)) {
      throw new DomainValidationError(
        `TimeEntry status must be one of ${TIME_ENTRY_STATUSES.join(', ')}.`,
      );
    }
  }

  /**
   * Truncate any wall-clock time to a stable day-only UTC instant.
   * Two TimeEntries are "the same day" iff toDateOnly(a) === toDateOnly(b).
   */
  private static toDateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // ── State transitions (T14) ─────────────────────────────────────────────────

  approve(approverId: string | null, now: Date): void {
    if (this.props.status !== 'PENDING') {
      throw new TimeEntryNotPendingError(this.props.status);
    }
    this.props = {
      ...this.props,
      status: 'APPROVED',
      approvedAt: now,
      approvedBy: approverId,
      updatedAt: now,
    };
  }

  reject(rejecterId: string | null, reason: string, now: Date): void {
    if (this.props.status !== 'PENDING') {
      throw new TimeEntryNotPendingError(this.props.status);
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new DomainValidationError('TimeEntry rejection reason is required.');
    }
    this.props = {
      ...this.props,
      status: 'REJECTED',
      rejectedAt: now,
      rejectedBy: rejecterId,
      rejectionReason: reason,
      updatedAt: now,
    };
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get id(): string { return this.props.id; }
  get employeeId(): string { return this.props.employeeId; }
  get date(): Date { return this.props.date; }
  get hours(): number { return this.props.hours; }
  get notes(): string | null { return this.props.notes; }
  get status(): TimeEntryStatus { return this.props.status; }
  get approvedAt(): Date | null { return this.props.approvedAt; }
  get approvedBy(): string | null { return this.props.approvedBy; }
  get rejectedAt(): Date | null { return this.props.rejectedAt; }
  get rejectedBy(): string | null { return this.props.rejectedBy; }
  get rejectionReason(): string | null { return this.props.rejectionReason; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
