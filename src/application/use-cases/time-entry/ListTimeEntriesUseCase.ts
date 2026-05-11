/**
 * ListTimeEntriesUseCase (T14)
 *
 * Lists all time entries, optionally filtered by status and/or employee.
 * Default (no filter) returns every entry across all employees.
 *
 * Validates `status` against the canonical TimeEntryStatus union;
 * unknown values raise DomainValidationError → 400.
 */

import { TIME_ENTRY_STATUSES, type TimeEntryStatus } from '@/domain/entities/TimeEntry';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type {
  FindTimeEntriesFilter,
  ITimeEntryRepository,
} from '@/domain/repositories/ITimeEntryRepository';

import type {
  ListTimeEntriesDto,
  ListTimeEntriesResponseDto,
} from '../../dtos/timeEntry.dto';
import { TimeEntryMapper } from '../../mappers/TimeEntryMapper';

export class ListTimeEntriesUseCase {
  constructor(private readonly timeEntryRepository: ITimeEntryRepository) {}

  async execute(dto: ListTimeEntriesDto = {}): Promise<ListTimeEntriesResponseDto> {
    const filter: FindTimeEntriesFilter = {};

    if (dto.status !== undefined) {
      if (!TIME_ENTRY_STATUSES.includes(dto.status as TimeEntryStatus)) {
        throw new DomainValidationError(
          `status must be one of ${TIME_ENTRY_STATUSES.join(', ')}.`,
        );
      }
      filter.status = dto.status;
    }

    if (dto.employeeId !== undefined && dto.employeeId !== '') {
      filter.employeeId = dto.employeeId;
    }

    const entries = await this.timeEntryRepository.findAll(filter);
    return { entries: entries.map((e) => TimeEntryMapper.toResponseDto(e)) };
  }
}
