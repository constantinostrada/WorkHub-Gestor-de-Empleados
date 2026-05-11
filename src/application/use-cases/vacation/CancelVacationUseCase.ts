/**
 * CancelVacationUseCase
 *
 * Cancels a vacation request strictly BEFORE start_date. Allowed transitions:
 *   PENDING  → CANCELLED
 *   APPROVED → CANCELLED
 * Rejected by domain when:
 *   - start_date <= now              → VacationAlreadyStartedError (HTTP 422)
 *   - current status is CANCELLED    → VacationNotCancellableError (HTTP 422)
 *   - current status is REJECTED     → VacationNotCancellableError (HTTP 422)
 *   - vacation does not exist        → DomainNotFoundError (HTTP 404)
 *
 * Status transitions and date-boundary check live on the Vacation entity;
 * this use case orchestrates load → cancel(now) → save and shapes the
 * minimal `{ id, status, cancelled_at }` response described by T11 AC-6.
 */

import type {
  CancelVacationResponseDto,
  CancelVacationResult,
} from '@/application/dtos/vacation.dto';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

export interface CancelVacationDto {
  vacationId: string;
  now: Date;
}

export class CancelVacationUseCase {
  constructor(private readonly vacationRepo: IVacationRepository) {}

  async execute(dto: CancelVacationDto): Promise<CancelVacationResult> {
    const vacation = await this.vacationRepo.findById(dto.vacationId);
    if (!vacation) {
      throw new DomainNotFoundError('Vacation', dto.vacationId);
    }

    // Capture status BEFORE the state transition so that T12 audit-trail
    // wiring can record what the vacation looked like prior to cancellation.
    const vacationStatusBefore = vacation.status;

    vacation.cancel(dto.now);
    await this.vacationRepo.save(vacation);

    const cancelledAt = vacation.cancelledAt;
    if (!cancelledAt) {
      // unreachable: cancel() always sets cancelledAt before returning
      throw new Error('Vacation.cancelledAt missing after cancel().');
    }

    const vacationDto: CancelVacationResponseDto = {
      id: vacation.id,
      status: 'cancelled',
      cancelled_at: cancelledAt.toISOString(),
    };

    return {
      vacation: vacationDto,
      vacation_status_before: vacationStatusBefore,
    };
  }
}
