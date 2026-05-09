/**
 * ITimeEntryRepository — Repository Interface (Domain)
 *
 * Describes WHAT the application can do with TimeEntry persistence.
 * No ORM types, no SQL, no third-party imports.
 */

import type { TimeEntry } from '../entities/TimeEntry';

export interface ITimeEntryRepository {
  /**
   * Persist a new TimeEntry. Implementations must enforce the
   * (employeeId, date) uniqueness invariant — see findByEmployeeAndDate
   * for the read-side check the use case performs first.
   */
  save(entry: TimeEntry): Promise<void>;

  /** Returns the entry for that employee on that day, or null. */
  findByEmployeeAndDate(employeeId: string, date: Date): Promise<TimeEntry | null>;

  /**
   * List entries for one employee whose date falls within [from, to]
   * (inclusive on both ends). Order: ascending by date.
   */
  findByEmployeeInRange(employeeId: string, from: Date, to: Date): Promise<TimeEntry[]>;
}
