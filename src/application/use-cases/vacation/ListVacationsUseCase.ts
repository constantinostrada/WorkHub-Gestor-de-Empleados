/**
 * ListVacationsUseCase
 *
 * Lists vacations filtered by status, embedding the employee summary
 * (id / first_name / last_name / email / position) for every vacation —
 * the AC-6 list endpoint needs to render that without a follow-up call.
 *
 * Defaults to status=PENDING when no filter is provided, matching the
 * dashboard use case from the AC literal: "GET /api/vacations?status=pending".
 */

import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import type {
  ListVacationsDto,
  VacationWithEmployeeResponseDto,
} from '../../dtos/vacation.dto';
import { VacationMapper } from '../../mappers/VacationMapper';

export class ListVacationsUseCase {
  constructor(
    private readonly vacationRepository: IVacationRepository,
    private readonly employeeRepository: IEmployeeRepository,
  ) {}

  async execute(dto: ListVacationsDto): Promise<VacationWithEmployeeResponseDto[]> {
    const status = dto.status ?? 'PENDING';
    const vacations = await this.vacationRepository.findByStatus(status);

    const result: VacationWithEmployeeResponseDto[] = [];
    for (const v of vacations) {
      const employee = await this.employeeRepository.findById(v.employeeId);
      if (!employee) {
        // Orphaned vacation (employee deleted): skip — onDelete: Cascade
        // makes this practically unreachable, but stay defensive.
        continue;
      }
      result.push(VacationMapper.toResponseWithEmployee(v, employee));
    }

    return result;
  }
}
