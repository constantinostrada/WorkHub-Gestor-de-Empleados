/**
 * HoursByAreaReportUseCase
 *
 * For a given (year, month) returns one row per area with the total hours
 * worked by all employees of that area during the month, plus the count of
 * employees currently assigned to the area.
 *
 * AC-1: GET /api/reports/hours-by-area?month=YYYY-MM
 *   → [{ area_id, area_name, total_hours, employee_count }]
 *
 * AC-4 implications: areas with zero hours still appear (employee_count
 * reflects membership, not activity).
 */

import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';

import type {
  HoursByAreaItemDto,
  HoursByAreaQuery,
} from '../../dtos/report.dto';

export class HoursByAreaReportUseCase {
  constructor(
    private readonly areaRepository: IAreaRepository,
    private readonly employeeRepository: IEmployeeRepository,
    private readonly timeEntryRepository: ITimeEntryRepository,
  ) {}

  async execute(query: HoursByAreaQuery): Promise<HoursByAreaItemDto[]> {
    const { year, month } = query;

    if (!Number.isInteger(year) || year < 1970 || year > 9999) {
      throw new DomainValidationError('year must be an integer between 1970 and 9999.');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new DomainValidationError('month must be an integer between 1 and 12.');
    }

    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0)); // last day of the month

    const areas = await this.areaRepository.findAll();

    const employeesPage = await this.employeeRepository.findAll(
      {},
      { page: 1, pageSize: 10000 },
    );
    const employees = employeesPage.items;

    const employeesByArea = new Map<string, string[]>();
    for (const area of areas) {
      employeesByArea.set(area.id, []);
    }
    for (const emp of employees) {
      if (emp.areaId && employeesByArea.has(emp.areaId)) {
        employeesByArea.get(emp.areaId)!.push(emp.id);
      }
    }

    const items: HoursByAreaItemDto[] = [];
    for (const area of areas) {
      const employeeIds = employeesByArea.get(area.id) ?? [];
      let totalHours = 0;
      for (const empId of employeeIds) {
        const entries = await this.timeEntryRepository.findByEmployeeInRange(
          empId,
          from,
          to,
        );
        for (const e of entries) {
          totalHours += e.hours;
        }
      }
      items.push({
        area_id: area.id,
        area_name: area.name,
        total_hours: Math.round(totalHours * 100) / 100,
        employee_count: employeeIds.length,
      });
    }

    return items;
  }
}
