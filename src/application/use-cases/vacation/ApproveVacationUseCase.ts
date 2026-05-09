/**
 * ApproveVacationUseCase
 *
 * Transitions a vacation from PENDING to APPROVED.
 *
 * Invariants:
 *  - Vacation must exist (DomainNotFoundError → 404).
 *  - Only PENDING → APPROVED is allowed; any other current status raises
 *    DomainValidationError → 400 (enforced inside Vacation.approve()).
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import type { ApproveVacationDto, VacationResponseDto } from '../../dtos/vacation.dto';
import { VacationMapper } from '../../mappers/VacationMapper';

export class ApproveVacationUseCase {
  constructor(private readonly vacationRepository: IVacationRepository) {}

  async execute(dto: ApproveVacationDto): Promise<VacationResponseDto> {
    const existing = await this.vacationRepository.findById(dto.vacationId);
    if (!existing) {
      throw new DomainNotFoundError('Vacation', dto.vacationId);
    }

    const approved = existing.approve(new Date());
    await this.vacationRepository.update(approved);

    return VacationMapper.toResponseDto(approved);
  }
}
