/**
 * TimeEntryMapper — Application Mapper
 *
 * Translates between domain TimeEntry entities and the snake_case
 * TimeEntryResponseDto exposed at the HTTP boundary.
 */

import type { TimeEntry } from '@/domain/entities/TimeEntry';

import type { TimeEntryResponseDto } from '../dtos/timeEntry.dto';

export class TimeEntryMapper {
  /** "YYYY-MM-DD" in UTC — the domain stores date-only at UTC midnight. */
  private static toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  static toResponseDto(entry: TimeEntry): TimeEntryResponseDto {
    return {
      id: entry.id,
      employee_id: entry.employeeId,
      date: TimeEntryMapper.toIsoDate(entry.date),
      hours: entry.hours,
      notes: entry.notes,
      status: entry.status,
      approved_at: entry.approvedAt ? entry.approvedAt.toISOString() : null,
      approved_by: entry.approvedBy,
      rejected_at: entry.rejectedAt ? entry.rejectedAt.toISOString() : null,
      rejected_by: entry.rejectedBy,
      rejection_reason: entry.rejectionReason,
      created_at: entry.createdAt.toISOString(),
      updated_at: entry.updatedAt.toISOString(),
    };
  }
}
