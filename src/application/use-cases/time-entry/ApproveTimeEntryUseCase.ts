/**
 * ApproveTimeEntryUseCase (T14)
 *
 * Transitions a TimeEntry from PENDING → APPROVED. Sets approvedAt + approvedBy.
 *
 * - TimeEntry must exist (DomainNotFoundError → 404)
 * - TimeEntry.status must be PENDING (TimeEntryNotPendingError → 422)
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';

import type { ApproveTimeEntryDto, TimeEntryResponseDto } from '../../dtos/timeEntry.dto';
import { TimeEntryMapper } from '../../mappers/TimeEntryMapper';

export class ApproveTimeEntryUseCase {
  constructor(private readonly timeEntryRepository: ITimeEntryRepository) {}

  async execute(dto: ApproveTimeEntryDto): Promise<TimeEntryResponseDto> {
    const entry = await this.timeEntryRepository.findById(dto.timeEntryId);
    if (!entry) {
      throw new DomainNotFoundError('TimeEntry', dto.timeEntryId);
    }

    const now = new Date();
    entry.approve(dto.approverId, now);
    await this.timeEntryRepository.save(entry);

    return TimeEntryMapper.toResponseDto(entry);
  }
}
