/**
 * RegisterTimeEntryUseCase
 *
 * Registers a single day's worked hours for an employee.
 *
 * Invariants enforced here:
 *  - employee must exist (DomainNotFoundError → 404)
 *  - hours range and date-not-future are validated by TimeEntry.create
 *    (DomainValidationError → 400)
 *  - one entry per (employee, date) — duplicate raises DomainConflictError → 409
 */

import { TimeEntry } from '@/domain/entities/TimeEntry';
import { DomainConflictError } from '@/domain/errors/DomainConflictError';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { EmployeeOffboardedError } from '@/domain/errors/EmployeeOffboardedError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';

import type { RegisterTimeEntryDto, TimeEntryResponseDto } from '../../dtos/timeEntry.dto';
import { TimeEntryMapper } from '../../mappers/TimeEntryMapper';
import { generateId } from '../../utils/generateId';

export class RegisterTimeEntryUseCase {
  constructor(
    private readonly timeEntryRepository: ITimeEntryRepository,
    private readonly employeeRepository: IEmployeeRepository,
  ) {}

  async execute(dto: RegisterTimeEntryDto): Promise<TimeEntryResponseDto> {
    // 1. Employee must exist.
    const employee = await this.employeeRepository.findById(dto.employeeId);
    if (!employee) {
      throw new DomainNotFoundError('Employee', dto.employeeId);
    }

    // 1b. T13 AC-3: offboarded employees can no longer log time.
    if (employee.isOffboarded && employee.offboardedAt !== null) {
      throw new EmployeeOffboardedError(employee.id, employee.offboardedAt);
    }

    // 2. Parse the date. We rely on TimeEntry.create to truncate to date-only
    //    and to validate the not-future invariant, but we materialise the Date
    //    here so the conflict check uses the same canonical value.
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) {
      // Defensive: validation in interfaces should already have caught this.
      // Domain rejects this via the validation chain inside TimeEntry.create.
    }

    // 3. Reject duplicate (employee, day) silently — must surface as 409.
    const existing = await this.timeEntryRepository.findByEmployeeAndDate(
      dto.employeeId,
      date,
    );
    if (existing) {
      throw new DomainConflictError(
        'TimeEntry',
        `A time entry for employee "${dto.employeeId}" on ${date.toISOString().slice(0, 10)} already exists.`,
      );
    }

    // 4. Construct the aggregate (also runs hours/date-future validation).
    const now = new Date();
    const entry = TimeEntry.create({
      id: generateId(),
      employeeId: dto.employeeId,
      date,
      hours: dto.hours,
      notes: dto.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Persist.
    await this.timeEntryRepository.save(entry);

    // 6. Return DTO.
    return TimeEntryMapper.toResponseDto(entry);
  }
}
