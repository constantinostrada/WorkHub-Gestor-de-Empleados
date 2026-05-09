/**
 * IVacationRepository — Repository Interface (Domain)
 *
 * Describes WHAT the application can do with Vacation persistence.
 * No ORM types, no SQL, no third-party imports.
 */

import type { Vacation, VacationStatus } from '../entities/Vacation';

export interface IVacationRepository {
  /** Persist a brand-new Vacation. */
  save(vacation: Vacation): Promise<void>;

  /** Replace an existing Vacation (used after approve()/reject()). */
  update(vacation: Vacation): Promise<void>;

  findById(id: string): Promise<Vacation | null>;

  /**
   * Returns all vacations for `employeeId` whose [start_date, end_date]
   * range overlaps with [start, end] AND whose status is in `statuses`.
   * Inclusive on both ends. Used for AC-3 conflict detection.
   *
   * `excludeId` (optional) skips the vacation with that id — useful
   * if a future flow ever lets users edit a vacation's range.
   */
  findOverlapping(
    employeeId: string,
    start: Date,
    end: Date,
    statuses: VacationStatus[],
    excludeId?: string,
  ): Promise<Vacation[]>;

  /**
   * All vacations for `employeeId` that touch the given calendar year
   * (i.e. start_date <= Dec 31 AND end_date >= Jan 1 of `year`).
   * Used by GetVacationBalanceUseCase.
   */
  findByEmployeeAndYear(employeeId: string, year: number): Promise<Vacation[]>;

  /**
   * All vacations whose status equals `status`. Ordered by created_at asc.
   * Used by AC-6 list endpoint.
   */
  findByStatus(status: VacationStatus): Promise<Vacation[]>;
}
