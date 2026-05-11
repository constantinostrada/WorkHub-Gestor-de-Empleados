export interface CreateVacationDto {
  employeeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface VacationResponseDto {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CancelVacationResponseDto {
  id: string;
  status: 'cancelled';
  cancelled_at: string;
}

export interface CancelVacationResult {
  vacation: CancelVacationResponseDto;
  vacation_status_before: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
}

export interface VacationCalendarQuery {
  year: number;
  month: number;
  areaId?: string;
}

export interface VacationCalendarEmployeeDto {
  id: string;
  name: string;
  status: 'PENDING' | 'APPROVED';
}

export interface VacationCalendarDayDto {
  date: string;
  employees: VacationCalendarEmployeeDto[];
}

export interface VacationCalendarResponseDto {
  year: number;
  month: number;
  days: VacationCalendarDayDto[];
}

export type BulkVacationAction = 'approve' | 'reject';

export interface BulkVacationActionFilter {
  from: Date;
  to: Date;
  areaId?: string;
  status?: 'PENDING';
}

export interface BulkVacationActionDto {
  filter: BulkVacationActionFilter;
  action: BulkVacationAction;
  reason?: string;
}

export interface BulkActionSucceededItem {
  vacation_id: string;
  new_status: 'APPROVED' | 'REJECTED';
}

export interface BulkActionFailedItem {
  vacation_id: string;
  reason: string;
}

export interface BulkVacationActionResult {
  processed: number;
  succeeded: BulkActionSucceededItem[];
  failed: BulkActionFailedItem[];
}
