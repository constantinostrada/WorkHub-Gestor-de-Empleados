/**
 * CreateVacationUseCase
 *
 * Creates a brand-new vacation request in PENDING status.
 *
 * Invariants enforced here:
 *  - Employee must exist (DomainNotFoundError → 404).
 *  - Range cannot overlap with another PENDING/APPROVED vacation
 *    of the same employee (DomainConflictError → 409).
 *  - Range / reason validation lives in Vacation.create
 *    (DomainValidationError → 400).
 */

import { Vacation } from '@/domain/entities/Vacation';
import { DomainConflictError } from '@/domain/errors/DomainConflictError';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import type { CreateVacationDto, VacationResponseDto } from '../../dtos/vacation.dto';
import { VacationMapper } from '../../mappers/VacationMapper';
import { generateId } from '../../utils/generateId';

export class CreateVacationUseCase {
  constructor(
    private readonly vacationRepository: IVacationRepository,
    private readonly employeeRepository: IEmployeeRepository,
  ) {}

  async execute(dto: CreateVacationDto): Promise<VacationResponseDto> {
    // 1. Employee must exist.
    const employee = await this.employeeRepository.findById(dto.employeeId);
    if (!employee) {
      throw new DomainNotFoundError('Employee', dto.employeeId);
    }

    // 2. Parse and canonicalise dates. Vacation.create truncates to date-only,
    //    we materialise here so the overlap query uses the canonical bounds.
    const start = Vacation.toDateOnly(new Date(dto.startDate));
    const end = Vacation.toDateOnly(new Date(dto.endDate));

    // 3. Reject overlapping PENDING/APPROVED ranges → 409.
    const conflicts = await this.vacationRepository.findOverlapping(
      dto.employeeId,
      start,
      end,
      ['PENDING', 'APPROVED'],
    );
    if (conflicts.length > 0) {
      throw new DomainConflictError(
        'Vacation',
        `Vacation range overlaps with an existing pending or approved vacation for employee "${dto.employeeId}".`,
      );
    }

    // 4. Build the aggregate (runs range / reason validation).
    const now = new Date();
    const vacation = Vacation.create({
      id: generateId(),
      employeeId: dto.employeeId,
      startDate: start,
      endDate: end,
      reason: dto.reason ?? null,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });

    // 5. Persist.
    await this.vacationRepository.save(vacation);

    // 6. Return DTO.
    return VacationMapper.toResponseDto(vacation);
  }
}
