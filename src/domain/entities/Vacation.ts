/**
 * Vacation — Aggregate Root
 *
 * Represents a vacation request that flows through a small state machine:
 *
 *     PENDING → APPROVED   (via approve())
 *     PENDING → REJECTED   (via reject())
 *
 * Any other transition (e.g. APPROVED → REJECTED, REJECTED → APPROVED,
 * already-final → anything) is invalid and raises DomainValidationError.
 *
 * Owns the invariants on date range (start <= end) and stable day-only
 * UTC truncation for both start_date and end_date so cross-timezone
 * persistence does not drift the boundaries.
 */

import { DomainValidationError } from '../errors/DomainValidationError';

export type VacationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const VacationStatusValues = {
  PENDING: 'PENDING' as const,
  APPROVED: 'APPROVED' as const,
  REJECTED: 'REJECTED' as const,
};

export interface VacationProps {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  status: VacationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Vacation {
  private readonly props: VacationProps;

  private constructor(props: VacationProps) {
    this.props = props;
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static create(props: VacationProps): Vacation {
    Vacation.validate(props);
    return new Vacation({
      ...props,
      startDate: Vacation.toDateOnly(props.startDate),
      endDate: Vacation.toDateOnly(props.endDate),
    });
  }

  private static validate(props: VacationProps): void {
    if (!props.employeeId.trim()) {
      throw new DomainValidationError('Vacation employeeId cannot be empty.');
    }
    const start = Vacation.toDateOnly(props.startDate).getTime();
    const end = Vacation.toDateOnly(props.endDate).getTime();
    if (start > end) {
      throw new DomainValidationError('Vacation start_date must be before or equal to end_date.');
    }
    if (props.reason !== null && props.reason.length > 1000) {
      throw new DomainValidationError('Vacation reason cannot exceed 1000 characters.');
    }
  }

  /**
   * Truncate any wall-clock time to a stable day-only UTC instant.
   * The vacation boundaries are days, not instants.
   */
  static toDateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // ── State transitions ─────────────────────────────────────────────────────

  approve(at: Date = new Date()): Vacation {
    if (this.props.status !== 'PENDING') {
      throw new DomainValidationError(
        `Vacation cannot transition from ${this.props.status} to APPROVED.`,
      );
    }
    return new Vacation({ ...this.props, status: 'APPROVED', updatedAt: at });
  }

  reject(at: Date = new Date()): Vacation {
    if (this.props.status !== 'PENDING') {
      throw new DomainValidationError(
        `Vacation cannot transition from ${this.props.status} to REJECTED.`,
      );
    }
    return new Vacation({ ...this.props, status: 'REJECTED', updatedAt: at });
  }

  /**
   * Number of calendar days the vacation spans, inclusive on both ends.
   * A single-day vacation (start == end) returns 1.
   */
  getDaysCount(): number {
    const ms = this.props.endDate.getTime() - this.props.startDate.getTime();
    return Math.round(ms / 86_400_000) + 1;
  }

  /**
   * Number of days within [yearStart, yearEnd] that this vacation covers.
   * Used for per-year balance computation when a vacation crosses Jan 1.
   * Inclusive on both ends.
   */
  getDaysCountInYear(year: number): number {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const start = this.props.startDate.getTime() > yearStart.getTime()
      ? this.props.startDate.getTime()
      : yearStart.getTime();
    const end = this.props.endDate.getTime() < yearEnd.getTime()
      ? this.props.endDate.getTime()
      : yearEnd.getTime();
    if (start > end) return 0;
    return Math.round((end - start) / 86_400_000) + 1;
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get id(): string { return this.props.id; }
  get employeeId(): string { return this.props.employeeId; }
  get startDate(): Date { return this.props.startDate; }
  get endDate(): Date { return this.props.endDate; }
  get reason(): string | null { return this.props.reason; }
  get status(): VacationStatus { return this.props.status; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
