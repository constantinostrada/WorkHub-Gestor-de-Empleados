import { randomUUID } from 'crypto';

import type {
  INotificationDispatcher,
  VacationCreatedEvent,
} from '@/application/ports/INotificationDispatcher';
import type { CreateVacationDto, VacationResponseDto } from '@/application/dtos/vacation.dto';
import { Vacation } from '@/domain/entities/Vacation';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

export class CreateVacationUseCase {
  constructor(
    private readonly vacationRepo: IVacationRepository,
    private readonly employeeRepo: IEmployeeRepository,
    private readonly areaRepo: IAreaRepository,
    private readonly dispatcher: INotificationDispatcher,
  ) {}

  async execute(dto: CreateVacationDto): Promise<VacationResponseDto> {
    const employee = await this.employeeRepo.findById(dto.employeeId);
    if (!employee) {
      throw new DomainNotFoundError('Employee', dto.employeeId);
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new DomainValidationError('start_date and end_date must be valid ISO dates.');
    }

    const vacation = Vacation.create({
      id: randomUUID(),
      employeeId: dto.employeeId,
      startDate: start,
      endDate: end,
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
    });

    await this.vacationRepo.save(vacation);

    // Outbound notification — fire-and-forget; never blocks/errors the response.
    if (!employee.areaId) {
      console.warn(
        `[notification] vacation.created skipped: employee ${employee.id} has no area`,
      );
    } else {
      const area = await this.areaRepo.findById(employee.areaId);
      if (!area || !area.managerId) {
        console.warn(
          `[notification] vacation.created skipped: area ${employee.areaId} has no manager`,
        );
      } else {
        const event: VacationCreatedEvent = {
          event_type: 'vacation.created',
          vacation_id: vacation.id,
          employee_id: employee.id,
          employee_name: employee.fullName,
          area_id: area.id,
          start_date: vacation.startDate.toISOString().slice(0, 10),
          end_date: vacation.endDate.toISOString().slice(0, 10),
          status: 'pending',
          created_at: vacation.createdAt.toISOString(),
        };
        void this.dispatcher
          .dispatch(event)
          .catch((err) => console.warn('[notification] dispatch failed', err));
      }
    }

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
