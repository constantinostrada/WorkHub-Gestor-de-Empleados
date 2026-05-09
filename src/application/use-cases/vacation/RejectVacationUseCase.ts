/**
 * RejectVacationUseCase
 *
 * Transitions a vacation from PENDING to REJECTED.
 *
 * Invariants:
 *  - Vacation must exist (DomainNotFoundError → 404).
 *  - Only PENDING → REJECTED is allowed; any other current status raises
 *    DomainValidationError → 400 (enforced inside Vacation.reject()).
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import type { RejectVacationDto, VacationResponseDto } from '../../dtos/vacation.dto';
import { VacationMapper } from '../../mappers/VacationMapper';

export class RejectVacationUseCase {
  constructor(private readonly vacationRepository: IVacationRepository) {}

  async execute(dto: RejectVacationDto): Promise<VacationResponseDto> {
    const existing = await this.vacationRepository.findById(dto.vacationId);
    if (!existing) {
      throw new DomainNotFoundError('Vacation', dto.vacationId);
    }

    const rejected = existing.reject(new Date());
    await this.vacationRepository.update(rejected);

    return VacationMapper.toResponseDto(rejected);
  }
}
