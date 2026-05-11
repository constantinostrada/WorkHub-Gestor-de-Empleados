import type {
  BulkActionFailedItem,
  BulkActionSucceededItem,
  BulkVacationActionDto,
  BulkVacationActionResult,
} from '@/application/dtos/vacation.dto';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

export class BulkVacationActionUseCase {
  constructor(
    private readonly vacationRepo: IVacationRepository,
    private readonly areaRepo: IAreaRepository,
  ) {}

  async execute(dto: BulkVacationActionDto): Promise<BulkVacationActionResult> {
    const { filter, action } = dto;

    if (filter.areaId !== undefined) {
      const area = await this.areaRepo.findById(filter.areaId);
      if (area === null) {
        throw new DomainNotFoundError('Area', filter.areaId);
      }
    }

    const candidates = await this.vacationRepo.findOverlapping(
      filter.from,
      filter.to,
      ['PENDING'],
      filter.areaId,
    );

    const succeeded: BulkActionSucceededItem[] = [];
    const failed: BulkActionFailedItem[] = [];

    for (const vacation of candidates) {
      if (vacation.status !== 'PENDING') continue;

      try {
        const now = new Date();
        if (action === 'approve') {
          vacation.approve(now);
        } else {
          vacation.reject(now);
        }
        await this.vacationRepo.save(vacation);
        succeeded.push({
          vacation_id: vacation.id,
          new_status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ vacation_id: vacation.id, reason });
      }
    }

    return {
      processed: succeeded.length + failed.length,
      succeeded,
      failed,
    };
  }
}
