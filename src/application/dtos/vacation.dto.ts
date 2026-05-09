/**
 * Vacation DTOs — minimal, scoped to T6.
 */

import type { VacationStatus } from '@/domain/entities/Vacation';

export interface CreateVacationDto {
  employeeId: string;
  startDate: string;       // ISO date or YYYY-MM-DD
  endDate: string;
  reason?: string;
}

export interface VacationResponseDto {
  id: string;
  employee_id: string;
  start_date: string;      // YYYY-MM-DD
  end_date: string;
  status: VacationStatus;
  reason: string | null;
  created_at: string;      // ISO8601
  updated_at: string;
}
