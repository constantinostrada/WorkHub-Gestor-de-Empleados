/**
 * GetVacationCalendarUseCase
 *
 * Builds a per-day grid of a calendar month listing every employee whose
 * PENDING or APPROVED vacation overlaps that day. Optionally filtered to a
 * single area. Cross-month vacations contribute only the days inside the
 * requested month. Days with no vacationing employees still appear with
 * employees: [].
 */

import type { Employee } from '@/domain/entities/Employee';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import type {
  VacationCalendarDayDto,
  VacationCalendarEmployeeDto,
  VacationCalendarQuery,
  VacationCalendarResponseDto,
} from '../../dtos/vacation.dto';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class GetVacationCalendarUseCase {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly vacationRepository: IVacationRepository,
  ) {}

  async execute(query: VacationCalendarQuery): Promise<VacationCalendarResponseDto> {
    const { year, month, areaId } = query;

    if (!Number.isInteger(year) || year < 1970 || year > 9999) {
      throw new DomainValidationError('year must be an integer between 1970 and 9999.');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new DomainValidationError('month must be an integer between 1 and 12.');
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));

    const employees = await this.loadEmployees(areaId);
    const employeesById = new Map<string, Employee>();
    for (const emp of employees) employeesById.set(emp.id, emp);

    const days: VacationCalendarDayDto[] = [];
    const daysInMonth = monthEnd.getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(Date.UTC(year, month - 1, d));
      days.push({ date: GetVacationCalendarUseCase.toIsoDate(date), employees: [] });
    }

    if (employees.length === 0) {
      return { year, month, days };
    }

    const vacations = await this.vacationRepository.findOverlapping(
      monthStart,
      monthEnd,
      ['PENDING', 'APPROVED'],
    );

    for (const vacation of vacations) {
      const employee = employeesById.get(vacation.employeeId);
      if (!employee) continue;

      const startMs = Math.max(vacation.startDate.getTime(), monthStart.getTime());
      const endMs = Math.min(vacation.endDate.getTime(), monthEnd.getTime());
      if (endMs < startMs) continue;

      const startDayIdx = Math.round((startMs - monthStart.getTime()) / ONE_DAY_MS);
      const endDayIdx = Math.round((endMs - monthStart.getTime()) / ONE_DAY_MS);

      const entry: VacationCalendarEmployeeDto = {
        id: employee.id,
        name: employee.fullName,
        status: vacation.status as 'PENDING' | 'APPROVED',
      };
      for (let i = startDayIdx; i <= endDayIdx; i++) {
        days[i]!.employees.push(entry);
      }
    }

    return { year, month, days };
  }

  private async loadEmployees(areaId?: string): Promise<Employee[]> {
    const filter = areaId ? { areaId } : undefined;
    const result = await this.employeeRepository.findAll(filter, {
      page: 1,
      pageSize: 10000,
    });
    return result.items;
  }

  private static toIsoDate(d: Date): string {
    const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
    const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = d.getUTCDate().toString().padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
