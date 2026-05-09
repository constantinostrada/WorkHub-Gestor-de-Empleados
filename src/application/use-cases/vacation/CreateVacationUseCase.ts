import { randomUUID } from 'crypto';

import type { CreateVacationDto, VacationResponseDto } from '@/application/dtos/vacation.dto';
import { Vacation } from '@/domain/entities/Vacation';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

export class CreateVacationUseCase {
  constructor(
    private readonly vacationRepo: IVacationRepository,
    private readonly employeeRepo: IEmployeeRepository,
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
