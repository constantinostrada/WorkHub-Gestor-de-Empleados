/**
 * Vacation DTOs
 *
 * Input/output contracts for vacation use cases.
 * Plain data — no domain types exposed.
 */

import type { VacationStatus } from '@/domain/entities/Vacation';

// ── Input DTOs ─────────────────────────────────────────────────────────────

export interface CreateVacationDto {
  employeeId: string;
  startDate: string;     // "YYYY-MM-DD"
  endDate: string;       // "YYYY-MM-DD"
  reason?: string;
}

export interface ApproveVacationDto {
  vacationId: string;
}

export interface RejectVacationDto {
  vacationId: string;
}

export interface GetVacationBalanceDto {
  employeeId: string;
  year: number;
}

export interface ListVacationsDto {
  status?: VacationStatus;
}

// ── Output DTOs ───────────────────────────────────────────────────────────

export interface VacationResponseDto {
  id: string;
  employee_id: string;
  start_date: string;     // "YYYY-MM-DD"
  end_date: string;       // "YYYY-MM-DD"
  reason: string | null;
  status: VacationStatus;
  created_at: string;
  updated_at: string;
}

export interface VacationEmployeeSummaryDto {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  position: string;
}

export interface VacationWithEmployeeResponseDto extends VacationResponseDto {
  employee: VacationEmployeeSummaryDto;
}

export interface VacationBalanceResponseDto {
  employee_id: string;
  year: number;
  total: number;
  used: number;
  pending: number;
  available: number;
}
