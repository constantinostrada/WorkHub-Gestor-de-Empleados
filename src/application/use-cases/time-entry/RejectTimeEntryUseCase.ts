/**
 * RejectTimeEntryUseCase (T14)
 *
 * Transitions a TimeEntry from PENDING → REJECTED. Sets rejectedAt +
 * rejectedBy + rejectionReason.
 *
 * - TimeEntry must exist (DomainNotFoundError → 404)
 * - reason is required (DomainValidationError → 400 if empty/missing)
 * - TimeEntry.status must be PENDING (TimeEntryNotPendingError → 422)
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';

import type { RejectTimeEntryDto, TimeEntryResponseDto } from '../../dtos/timeEntry.dto';
import { TimeEntryMapper } from '../../mappers/TimeEntryMapper';

export class RejectTimeEntryUseCase {
  constructor(private readonly timeEntryRepository: ITimeEntryRepository) {}

  async execute(dto: RejectTimeEntryDto): Promise<TimeEntryResponseDto> {
    if (typeof dto.reason !== 'string' || dto.reason.trim() === '') {
      throw new DomainValidationError('TimeEntry rejection reason is required.');
    }

    const entry = await this.timeEntryRepository.findById(dto.timeEntryId);
    if (!entry) {
      throw new DomainNotFoundError('TimeEntry', dto.timeEntryId);
    }

    const now = new Date();
    entry.reject(dto.rejecterId, dto.reason, now);
    await this.timeEntryRepository.save(entry);

    return TimeEntryMapper.toResponseDto(entry);
  }
}
