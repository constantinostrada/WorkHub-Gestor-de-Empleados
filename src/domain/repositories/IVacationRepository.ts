/**
 * IVacationRepository — Repository Interface (Domain)
 *
 * Describes WHAT the application can do with Vacation persistence.
 * No ORM types, no SQL, no third-party imports.
 */

import type { Vacation, VacationStatus } from '../entities/Vacation';

export interface IVacationRepository {
  save(vacation: Vacation): Promise<void>;

  /** Returns the vacation by id, or null. */
  findById(id: string): Promise<Vacation | null>;

  /**
   * List vacations for one employee whose date range overlaps [from, to]
   * (inclusive on both ends). Optionally filtered by statuses.
   * Order: ascending by startDate.
   */
  findByEmployeeOverlapping(
    employeeId: string,
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
  ): Promise<Vacation[]>;

  /**
   * All vacations whose date range overlaps [from, to], optionally filtered by
   * status and by the owning employee's area. The area filter joins through
   * Employee.areaId at the persistence boundary so callers stay area-agnostic.
   */
  findOverlapping(
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
    areaId?: string,
  ): Promise<Vacation[]>;
}
