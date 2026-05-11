/**
 * ITimeEntryRepository — Repository Interface (Domain)
 *
 * Describes WHAT the application can do with TimeEntry persistence.
 * No ORM types, no SQL, no third-party imports.
 */

import type { TimeEntry, TimeEntryStatus } from '../entities/TimeEntry';

export interface FindTimeEntriesFilter {
  status?: TimeEntryStatus;
  employeeId?: string;
}

export interface ITimeEntryRepository {
  /**
   * Persist a TimeEntry — upsert by id. Implementations must enforce the
   * (employeeId, date) uniqueness invariant on inserts; updates pass through
   * unconditionally so state transitions (approve/reject) overwrite the row.
   */
  save(entry: TimeEntry): Promise<void>;

  /** Returns the entry for that employee on that day, or null. */
  findByEmployeeAndDate(employeeId: string, date: Date): Promise<TimeEntry | null>;

  /**
   * List entries for one employee whose date falls within [from, to]
   * (inclusive on both ends). Order: ascending by date.
   */
  findByEmployeeInRange(employeeId: string, from: Date, to: Date): Promise<TimeEntry[]>;

  /** Look up a TimeEntry by primary key. */
  findById(id: string): Promise<TimeEntry | null>;

  /** List all entries, optionally filtered by status/employee. Order: desc by date. */
  findAll(filter?: FindTimeEntriesFilter): Promise<TimeEntry[]>;
}
