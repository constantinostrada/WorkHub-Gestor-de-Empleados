import type {
  INotificationDispatcher,
  VacationRejectedEvent,
} from '@/application/ports/INotificationDispatcher';
import type { VacationResponseDto } from '@/application/dtos/vacation.dto';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

export interface RejectVacationDto {
  vacationId: string;
  approverId?: string | null;
  reason?: string;
}

export class RejectVacationUseCase {
  constructor(
    private readonly vacationRepo: IVacationRepository,
    private readonly dispatcher: INotificationDispatcher,
  ) {}

  async execute(dto: RejectVacationDto): Promise<VacationResponseDto> {
    const vacation = await this.vacationRepo.findById(dto.vacationId);
    if (!vacation) {
      throw new DomainNotFoundError('Vacation', dto.vacationId);
    }

    const decidedAt = new Date();
    vacation.reject(decidedAt);
    await this.vacationRepo.save(vacation);

    const event: VacationRejectedEvent = {
      event_type: 'vacation.rejected',
      vacation_id: vacation.id,
      employee_id: vacation.employeeId,
      approver_id: dto.approverId ?? null,
      start_date: vacation.startDate.toISOString().slice(0, 10),
      end_date: vacation.endDate.toISOString().slice(0, 10),
      decided_at: decidedAt.toISOString(),
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
    };
    void this.dispatcher
      .dispatch(event)
      .catch((err) => console.warn('[notification] dispatch failed', err));

    return {
      id: vacation.id,
      employee_id: vacation.employeeId,
      start_date: vacation.startDate.toISOString().slice(0, 10),
      end_date: vacation.endDate.toISOString().slice(0, 10),
      status: vacation.status,
      reason: vacation.reason,
      created_at: vacation.createdAt.toISOString(),
      updated_at: vacation.updatedAt.toISOString(),
    };
  }
}
