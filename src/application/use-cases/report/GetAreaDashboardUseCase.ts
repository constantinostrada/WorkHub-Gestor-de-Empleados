/**
 * GetAreaDashboardUseCase
 *
 * Aggregated read-only metrics for an Area within a [from, to] date range:
 * headcount_active, total_hours, vacation_days, avg_approval_hours, and the
 * top 5 employees by hours worked. Single round-trip for manager dashboards.
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import type {
  AreaDashboardQuery,
  AreaDashboardResponseDto,
  AreaDashboardTopEmployeeDto,
} from '../../dtos/report.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const TOP_EMPLOYEES_LIMIT = 5;

export class GetAreaDashboardUseCase {
  constructor(
    private readonly areaRepository: IAreaRepository,
    private readonly employeeRepository: IEmployeeRepository,
    private readonly timeEntryRepository: ITimeEntryRepository,
    private readonly vacationRepository: IVacationRepository,
  ) {}

  async execute(query: AreaDashboardQuery): Promise<AreaDashboardResponseDto> {
    const { areaId, from, to } = query;

    if (!areaId || !areaId.trim()) {
      throw new DomainValidationError('areaId is required.');
    }
    if (!(from instanceof Date) || Number.isNaN(from.getTime())) {
      throw new DomainValidationError('"from" must be a valid date.');
    }
    if (!(to instanceof Date) || Number.isNaN(to.getTime())) {
      throw new DomainValidationError('"to" must be a valid date.');
    }
    if (from.getTime() > to.getTime()) {
      throw new DomainValidationError('"from" must be on or before "to".');
    }

    const area = await this.areaRepository.findById(areaId);
    if (area === null) {
      throw new DomainNotFoundError('Area', areaId);
    }

    const employeesPage = await this.employeeRepository.findAll(
      { areaId: area.id },
      { page: 1, pageSize: 10000 },
    );
    const employees = employeesPage.items;

    // AC-4: headcount counts only ACTIVE employees of the area.
    const headcountActive = employees.filter((e) => e.isActive).length;

    // AC-5 + AC-8: sum APPROVED hours per employee within [from, to].
    // Note: TimeEntry on this branch has no `status` field (T14 not yet on
    // main). Every persisted entry is implicitly final, so we count them all.
    const hoursByEmployee = new Map<string, number>();
    for (const emp of employees) {
      const entries = await this.timeEntryRepository.findByEmployeeInRange(
        emp.id,
        from,
        to,
      );
      let sum = 0;
      for (const entry of entries) {
        sum += entry.hours;
      }
      hoursByEmployee.set(emp.id, sum);
    }
    let totalHours = 0;
    for (const h of hoursByEmployee.values()) totalHours += h;

    // AC-6: vacation_days = sum of APPROVED vacation days overlapping the
    // range, clipped to [from, to] inclusive.
    const fromDay = toUtcDay(from);
    const toDay = toUtcDay(to);
    let vacationDays = 0;
    for (const emp of employees) {
      const vacations = await this.vacationRepository.findByEmployeeOverlapping(
        emp.id,
        from,
        to,
        ['APPROVED'],
      );
      for (const v of vacations) {
        vacationDays += clippedDayCount(v.startDate, v.endDate, fromDay, toDay);
      }
    }

    // AC-7: avg approval hours over APPROVED vacations of the area whose
    // createdAt falls within [from, to]. The Vacation entity has no
    // `approvedAt` field on this branch; `updatedAt` is the canonical
    // approval timestamp because approve() sets it and APPROVED is terminal.
    let approvalHoursSum = 0;
    let approvedCount = 0;
    for (const emp of employees) {
      const vacations = await this.vacationRepository.findByEmployeeOverlapping(
        emp.id,
        FAR_PAST,
        FAR_FUTURE,
        ['APPROVED'],
      );
      for (const v of vacations) {
        const createdAtMs = v.createdAt.getTime();
        if (createdAtMs < from.getTime() || createdAtMs > to.getTime()) continue;
        approvalHoursSum += (v.updatedAt.getTime() - createdAtMs) / MS_PER_HOUR;
        approvedCount += 1;
      }
    }
    const avgApprovalHours =
      approvedCount === 0 ? 0 : approvalHoursSum / approvedCount;

    // AC-8: top 5 employees by hours, desc. If <5, return what's there.
    const topEmployees: AreaDashboardTopEmployeeDto[] = employees
      .map((emp) => ({
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        hours: round2(hoursByEmployee.get(emp.id) ?? 0),
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, TOP_EMPLOYEES_LIMIT);

    return {
      headcount_active: headcountActive,
      total_hours: round2(totalHours),
      vacation_days: vacationDays,
      avg_approval_hours: round2(avgApprovalHours),
      top_employees: topEmployees,
    };
  }
}

const FAR_PAST = new Date(Date.UTC(1970, 0, 1));
const FAR_FUTURE = new Date(Date.UTC(9999, 11, 31));

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function clippedDayCount(
  vacationStart: Date,
  vacationEnd: Date,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  const vStart = toUtcDay(vacationStart).getTime();
  const vEnd = toUtcDay(vacationEnd).getTime();
  const rStart = rangeStart.getTime();
  const rEnd = rangeEnd.getTime();
  const start = Math.max(vStart, rStart);
  const end = Math.min(vEnd, rEnd);
  if (end < start) return 0;
  return Math.floor((end - start) / MS_PER_DAY) + 1;
}
