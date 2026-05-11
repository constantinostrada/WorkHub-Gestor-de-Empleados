/**
 * GetEmployeeMonthlyReportUseCase
 *
 * For a given (employeeId, year) returns a 12-element array — one row per
 * calendar month — with the hours worked and the APPROVED vacation days
 * falling inside that month. Suitable for heatmap-style visualisations.
 *
 * AC-3: GET /api/reports/employee/:id/monthly?year=YYYY
 *   → [{ month: 1..12, hours_worked, vacation_days }]
 *
 * AC-4 implication: every month is present; months with no activity have
 * hours_worked = 0 and vacation_days = 0.
 *
 * Cross-year handling: a vacation that spans Dec→Jan is clipped at year
 * boundaries via Vacation.getDaysCountInYear before being distributed
 * across the months it touches.
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import type {
  EmployeeMonthlyItemDto,
  EmployeeMonthlyQuery,
} from '../../dtos/report.dto';

export class GetEmployeeMonthlyReportUseCase {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly timeEntryRepository: ITimeEntryRepository,
    private readonly vacationRepository: IVacationRepository,
  ) {}

  async execute(query: EmployeeMonthlyQuery): Promise<EmployeeMonthlyItemDto[]> {
    const { employeeId, year } = query;

    if (!Number.isInteger(year) || year < 1970 || year > 9999) {
      throw new DomainValidationError('year must be an integer between 1970 and 9999.');
    }

    const employee = await this.employeeRepository.findById(employeeId);
    if (!employee) {
      throw new DomainNotFoundError('Employee', employeeId);
    }

    // T13 AC-7: by default, offboarded employees are hidden from reports.
    // Caller must opt in via includeOffboarded=true to view their history.
    if (employee.isOffboarded && !(query.includeOffboarded ?? false)) {
      throw new DomainNotFoundError('Employee', employeeId);
    }

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));

    const items: EmployeeMonthlyItemDto[] = [];
    for (let m = 1; m <= 12; m++) {
      items.push({ month: m, hours_worked: 0, vacation_days: 0 });
    }

    const entries = await this.timeEntryRepository.findByEmployeeInRange(
      employeeId,
      yearStart,
      yearEnd,
    );
    for (const entry of entries) {
      const m = entry.date.getUTCMonth(); // 0-indexed
      items[m]!.hours_worked += entry.hours;
    }
    for (let i = 0; i < 12; i++) {
      items[i]!.hours_worked = Math.round(items[i]!.hours_worked * 100) / 100;
    }

    const vacations = await this.vacationRepository.findByEmployeeOverlapping(
      employeeId,
      yearStart,
      yearEnd,
      ['APPROVED'],
    );
    for (const vacation of vacations) {
      this.distributeVacationDays(vacation.startDate, vacation.endDate, year, items);
    }

    return items;
  }

  /**
   * Iterates each day of the vacation window, clipping to [Jan 1, Dec 31]
   * of `year`, and increments the matching month bucket.
   */
  private distributeVacationDays(
    startDate: Date,
    endDate: Date,
    year: number,
    items: EmployeeMonthlyItemDto[],
  ): void {
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year, 11, 31);
    const ONE_DAY = 24 * 60 * 60 * 1000;

    let cursor = Math.max(startDate.getTime(), yearStart);
    const stop = Math.min(endDate.getTime(), yearEnd);

    while (cursor <= stop) {
      const month = new Date(cursor).getUTCMonth(); // 0-indexed
      items[month]!.vacation_days += 1;
      cursor += ONE_DAY;
    }
  }
}
