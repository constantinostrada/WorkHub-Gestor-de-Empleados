/**
 * Report DTOs — input/output contracts for manager-facing reports.
 *
 * Field names follow the snake_case API convention exposed to the
 * outside world; route handlers pass these through unchanged.
 */

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface HoursByAreaQuery {
  /** Year of the reporting month (e.g., 2026). */
  year: number;
  /** Month of the year, 1..12. */
  month: number;
}

export interface VacationsSummaryQuery {
  year: number;
}

export interface EmployeeMonthlyQuery {
  employeeId: string;
  year: number;
}

// ── Outputs ──────────────────────────────────────────────────────────────────

export interface HoursByAreaItemDto {
  area_id: string;
  area_name: string;
  total_hours: number;
  employee_count: number;
}

export interface VacationsSummaryItemDto {
  employee_id: string;
  name: string;
  days_taken: number;
  days_pending: number;
  days_available: number;
}

export interface EmployeeMonthlyItemDto {
  month: number;
  hours_worked: number;
  vacation_days: number;
}
