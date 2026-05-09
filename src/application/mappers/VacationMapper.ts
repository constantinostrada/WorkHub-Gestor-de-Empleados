/**
 * VacationMapper — Application Mapper
 *
 * Translates between the domain Vacation entity and the snake_case
 * DTOs exposed at the HTTP boundary.
 */

import type { Employee } from '@/domain/entities/Employee';
import type { Vacation } from '@/domain/entities/Vacation';

import type {
  VacationResponseDto,
  VacationWithEmployeeResponseDto,
} from '../dtos/vacation.dto';

export class VacationMapper {
  /** "YYYY-MM-DD" in UTC — vacations store date-only at UTC midnight. */
  private static toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  static toResponseDto(v: Vacation): VacationResponseDto {
    return {
      id: v.id,
      employee_id: v.employeeId,
      start_date: VacationMapper.toIsoDate(v.startDate),
      end_date: VacationMapper.toIsoDate(v.endDate),
      reason: v.reason,
      status: v.status,
      created_at: v.createdAt.toISOString(),
      updated_at: v.updatedAt.toISOString(),
    };
  }

  static toResponseWithEmployee(
    v: Vacation,
    employee: Employee,
  ): VacationWithEmployeeResponseDto {
    return {
      ...VacationMapper.toResponseDto(v),
      employee: {
        id: employee.id,
        first_name: employee.firstName,
        last_name: employee.lastName,
        email: employee.email.value,
        position: employee.position,
      },
    };
  }
}
