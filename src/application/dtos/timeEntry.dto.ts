/**
 * TimeEntry DTOs
 *
 * Input/output contracts for time-entry use cases.
 * Plain data — no domain types exposed.
 */

// ── Input DTOs ─────────────────────────────────────────────────────────────

export interface RegisterTimeEntryDto {
  employeeId: string;
  date: string;     // ISO-8601 date string ("YYYY-MM-DD" or full ISO)
  hours: number;
  notes?: string;
}

export interface ListTimeEntriesByEmployeeDto {
  employeeId: string;
  from: string;     // ISO-8601 date "YYYY-MM-DD"
  to: string;       // ISO-8601 date "YYYY-MM-DD"
}

// ── Output DTOs ───────────────────────────────────────────────────────────

export interface TimeEntryResponseDto {
  id: string;
  employee_id: string;
  date: string;     // "YYYY-MM-DD"
  hours: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntriesRangeResponseDto {
  entries: TimeEntryResponseDto[];
  total_hours: number;
}
