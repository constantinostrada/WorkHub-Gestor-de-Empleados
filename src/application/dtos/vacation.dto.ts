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
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string | null;
  created_at: string;
  updated_at: string;
}
