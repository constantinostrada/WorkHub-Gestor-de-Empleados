import type {
  INotificationDispatcher,
  VacationApprovedEvent,
} from '@/application/ports/INotificationDispatcher';
import type { VacationResponseDto } from '@/application/dtos/vacation.dto';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

export interface ApproveVacationDto {
  vacationId: string;
  approverId?: string | null;
}

export class ApproveVacationUseCase {
  constructor(
    private readonly vacationRepo: IVacationRepository,
    private readonly dispatcher: INotificationDispatcher,
  ) {}

  async execute(dto: ApproveVacationDto): Promise<VacationResponseDto> {
    const vacation = await this.vacationRepo.findById(dto.vacationId);
    if (!vacation) {
      throw new DomainNotFoundError('Vacation', dto.vacationId);
    }

    const decidedAt = new Date();
    vacation.approve(decidedAt);
    await this.vacationRepo.save(vacation);

    const event: VacationApprovedEvent = {
      event_type: 'vacation.approved',
      vacation_id: vacation.id,
      employee_id: vacation.employeeId,
      approver_id: dto.approverId ?? null,
      start_date: vacation.startDate.toISOString().slice(0, 10),
      end_date: vacation.endDate.toISOString().slice(0, 10),
      decided_at: decidedAt.toISOString(),
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
