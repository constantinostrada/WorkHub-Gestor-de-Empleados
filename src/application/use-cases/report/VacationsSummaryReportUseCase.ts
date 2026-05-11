/**
 * VacationsSummaryReportUseCase
 *
 * For a given year returns one row per employee summarising vacation usage:
 *   - days_taken    → days inside the year already APPROVED
 *   - days_pending  → days inside the year still PENDING approval
 *   - days_available → ANNUAL_VACATION_DAYS minus days_taken (cannot go below 0)
 *
 * AC-2: GET /api/reports/vacations-summary?year=YYYY
 *   → [{ employee_id, name, days_taken, days_pending, days_available }]
 *
 * AC-4 implication: employees with zero vacations still appear, all zeros.
 */

import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import type {
  VacationsSummaryItemDto,
  VacationsSummaryQuery,
} from '../../dtos/report.dto';

const ANNUAL_VACATION_DAYS = 14;

export class VacationsSummaryReportUseCase {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly vacationRepository: IVacationRepository,
  ) {}

  async execute(query: VacationsSummaryQuery): Promise<VacationsSummaryItemDto[]> {
    const { year } = query;
    if (!Number.isInteger(year) || year < 1970 || year > 9999) {
      throw new DomainValidationError('year must be an integer between 1970 and 9999.');
    }

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));

    const employeesPage = await this.employeeRepository.findAll(
      { includeOffboarded: query.includeOffboarded ?? false },
      { page: 1, pageSize: 10000 },
    );
    const employees = employeesPage.items;

    const items: VacationsSummaryItemDto[] = [];
    for (const employee of employees) {
      const approved = await this.vacationRepository.findByEmployeeOverlapping(
        employee.id,
        yearStart,
        yearEnd,
        ['APPROVED'],
      );
      const pending = await this.vacationRepository.findByEmployeeOverlapping(
        employee.id,
        yearStart,
        yearEnd,
        ['PENDING'],
      );

      const days_taken = approved.reduce(
        (sum, v) => sum + v.getDaysCountInYear(year),
        0,
      );
      const days_pending = pending.reduce(
        (sum, v) => sum + v.getDaysCountInYear(year),
        0,
      );
      const days_available = Math.max(0, ANNUAL_VACATION_DAYS - days_taken);

      items.push({
        employee_id: employee.id,
        name: employee.fullName,
        days_taken,
        days_pending,
        days_available,
      });
    }

    return items;
  }
}
