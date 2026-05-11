/**
 * TimeEntry DTOs
 *
 * Input/output contracts for time-entry use cases.
 * Plain data — no domain types exposed.
 */

import type { TimeEntryStatus } from '@/domain/entities/TimeEntry';

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

export interface ListTimeEntriesDto {
  status?: TimeEntryStatus;
  employeeId?: string;
}

export interface ApproveTimeEntryDto {
  timeEntryId: string;
  approverId: string | null;
}

export interface RejectTimeEntryDto {
  timeEntryId: string;
  rejecterId: string | null;
  reason: string;
}

// ── Output DTOs ───────────────────────────────────────────────────────────

export interface TimeEntryResponseDto {
  id: string;
  employee_id: string;
  date: string;     // "YYYY-MM-DD"
  hours: number;
  notes: string | null;
  status: TimeEntryStatus;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntriesRangeResponseDto {
  entries: TimeEntryResponseDto[];
  total_hours: number;
}

export interface ListTimeEntriesResponseDto {
  entries: TimeEntryResponseDto[];
}
