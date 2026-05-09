/**
 * TimeEntry — Aggregate Root
 *
 * Represents a single day's worked-hours record for an employee.
 * Owns the invariants on hours range and date validity.
 */

import { DomainValidationError } from '../errors/DomainValidationError';

export interface TimeEntryProps {
  id: string;
  employeeId: string;
  date: Date;
  hours: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TimeEntry {
  static readonly MIN_HOURS = 0.5;
  static readonly MAX_HOURS = 16;

  private readonly props: TimeEntryProps;

  private constructor(props: TimeEntryProps) {
    this.props = props;
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static create(props: TimeEntryProps): TimeEntry {
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
  }

  /**
   * Truncate any wall-clock time to a stable day-only UTC instant.
   * Two TimeEntries are "the same day" iff toDateOnly(a) === toDateOnly(b).
   */
  private static toDateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get id(): string { return this.props.id; }
  get employeeId(): string { return this.props.employeeId; }
  get date(): Date { return this.props.date; }
  get hours(): number { return this.props.hours; }
  get notes(): string | null { return this.props.notes; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
