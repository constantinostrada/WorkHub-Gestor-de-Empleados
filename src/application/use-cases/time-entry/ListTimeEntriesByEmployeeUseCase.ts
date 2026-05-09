/**
 * ListTimeEntriesByEmployeeUseCase
 *
 * Returns all time entries for an employee within an inclusive [from, to]
 * range, plus the total hours summed across the returned entries.
 *
 * - employee must exist (DomainNotFoundError → 404)
 * - from must not be after to (DomainValidationError → 400)
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';

import type {
  ListTimeEntriesByEmployeeDto,
  TimeEntriesRangeResponseDto,
} from '../../dtos/timeEntry.dto';
import { TimeEntryMapper } from '../../mappers/TimeEntryMapper';

export class ListTimeEntriesByEmployeeUseCase {
  constructor(
    private readonly timeEntryRepository: ITimeEntryRepository,
    private readonly employeeRepository: IEmployeeRepository,
  ) {}

  async execute(dto: ListTimeEntriesByEmployeeDto): Promise<TimeEntriesRangeResponseDto> {
    const employee = await this.employeeRepository.findById(dto.employeeId);
    if (!employee) {
      throw new DomainNotFoundError('Employee', dto.employeeId);
    }

    const from = new Date(dto.from);
    const to = new Date(dto.to);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new DomainValidationError('from/to must be valid ISO-8601 date strings.');
    }
    if (from.getTime() > to.getTime()) {
      throw new DomainValidationError('"from" date must be on or before "to" date.');
    }

    const entries = await this.timeEntryRepository.findByEmployeeInRange(
      dto.employeeId,
      from,
      to,
    );

    const total_hours = entries.reduce((sum, e) => sum + e.hours, 0);

    return {
      entries: entries.map((e) => TimeEntryMapper.toResponseDto(e)),
      total_hours: Math.round(total_hours * 100) / 100, // 2-decimal hygiene
    };
  }
}
