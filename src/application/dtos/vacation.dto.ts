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
