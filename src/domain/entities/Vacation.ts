/**
 * Vacation — Aggregate Root
 *
 * Represents an employee's vacation request with an approval workflow.
 * Owns invariants on date order, status transitions, and day counting.
 */

import { DomainValidationError } from '../errors/DomainValidationError';
import { VacationAlreadyStartedError } from '../errors/VacationAlreadyStartedError';
import { VacationNotCancellableError } from '../errors/VacationNotCancellableError';

export type VacationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface VacationProps {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
  status: VacationStatus;
  reason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VacationCreateInput {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
  status?: VacationStatus;
  reason?: string | null;
  cancelledAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Vacation {
  private props: VacationProps;

  private constructor(props: VacationProps) {
    this.props = props;
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static create(input: VacationCreateInput): Vacation {
    if (!input.employeeId.trim()) {
      throw new DomainValidationError('Vacation employeeId cannot be empty.');
    }
    const start = Vacation.toDateOnly(input.startDate);
    const end = Vacation.toDateOnly(input.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new DomainValidationError('Vacation dates must be valid.');
    }
    if (end.getTime() < start.getTime()) {
      throw new DomainValidationError('Vacation endDate cannot be before startDate.');
    }
    const now = new Date();
    return new Vacation({
      id: input.id,
      employeeId: input.employeeId,
      startDate: start,
      endDate: end,
      status: input.status ?? 'PENDING',
      reason: input.reason ?? null,
      cancelledAt: input.cancelledAt ?? null,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    });
  }

  // ── Day-only canonical form ────────────────────────────────────────────────

  private static toDateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // ── State machine ─────────────────────────────────────────────────────────

  approve(at: Date = new Date()): void {
    if (this.props.status !== 'PENDING') {
      throw new DomainValidationError(
        `Cannot approve a vacation with status ${this.props.status}.`,
      );
    }
    this.props.status = 'APPROVED';
    this.props.updatedAt = at;
  }

  reject(at: Date = new Date()): void {
    if (this.props.status !== 'PENDING') {
      throw new DomainValidationError(
        `Cannot reject a vacation with status ${this.props.status}.`,
      );
    }
    this.props.status = 'REJECTED';
    this.props.updatedAt = at;
  }

  /**
   * Cancel a not-yet-started vacation. Allowed from PENDING or APPROVED.
   * Throws VacationAlreadyStartedError if `now >= startDate` and
   * VacationNotCancellableError when the current status is terminal
   * (CANCELLED or REJECTED).
   */
  cancel(now: Date): void {
    if (this.props.status === 'CANCELLED' || this.props.status === 'REJECTED') {
      throw new VacationNotCancellableError(this.props.status);
    }
    if (now.getTime() >= this.props.startDate.getTime()) {
      throw new VacationAlreadyStartedError(this.props.startDate);
    }
    this.props.status = 'CANCELLED';
    this.props.cancelledAt = now;
    this.props.updatedAt = now;
  }

  /**
   * Cascade-cancel triggered by employee offboarding (T13 AC-4). Only
   * applicable to PENDING vacations. Sets reason to the system-provided
   * value (audit trail proof that the cancel was system-driven, not user
   * initiated). Skips the "already-started" date check — offboarding is a
   * privileged system action.
   */
  cancelForOffboard(now: Date, reason: string): void {
    if (this.props.status !== 'PENDING') {
      throw new VacationNotCancellableError(this.props.status);
    }
    this.props.status = 'CANCELLED';
    this.props.cancelledAt = now;
    this.props.reason = reason;
    this.props.updatedAt = now;
  }

  // ── Day counting ──────────────────────────────────────────────────────────

  /** Inclusive day count between startDate and endDate. */
  getDaysCount(): number {
    const ms = this.props.endDate.getTime() - this.props.startDate.getTime();
    return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  }

  /**
   * Day count clipped to a given calendar year. Required for cross-year
   * vacations (e.g., Dec 30 → Jan 3) so each year is reported separately.
   */
  getDaysCountInYear(year: number): number {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const start = this.props.startDate.getTime() > yearStart.getTime()
      ? this.props.startDate
      : yearStart;
    const end = this.props.endDate.getTime() < yearEnd.getTime()
      ? this.props.endDate
      : yearEnd;
    if (end.getTime() < start.getTime()) return 0;
    const ms = end.getTime() - start.getTime();
    return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get id(): string { return this.props.id; }
  get employeeId(): string { return this.props.employeeId; }
  get startDate(): Date { return this.props.startDate; }
  get endDate(): Date { return this.props.endDate; }
  get status(): VacationStatus { return this.props.status; }
  get reason(): string | null { return this.props.reason; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
