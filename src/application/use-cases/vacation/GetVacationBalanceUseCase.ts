/**
 * GetVacationBalanceUseCase
 *
 * Computes the remaining vacation budget for an employee in a given year.
 *
 *   total     = 14 (fixed annual baseline per AC-5)
 *   used      = sum of approved-vacation days that fall inside the year
 *   pending   = sum of pending-vacation days that fall inside the year
 *   available = total - used - pending
 *
 * Vacations that straddle Jan 1 / Dec 31 are clipped to the year via
 * Vacation.getDaysCountInYear so the totals stay coherent across years.
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import type {
  GetVacationBalanceDto,
  VacationBalanceResponseDto,
} from '../../dtos/vacation.dto';

const ANNUAL_VACATION_DAYS = 14;

export class GetVacationBalanceUseCase {
  constructor(
    private readonly vacationRepository: IVacationRepository,
    private readonly employeeRepository: IEmployeeRepository,
  ) {}

  async execute(dto: GetVacationBalanceDto): Promise<VacationBalanceResponseDto> {
    const employee = await this.employeeRepository.findById(dto.employeeId);
    if (!employee) {
      throw new DomainNotFoundError('Employee', dto.employeeId);
    }

    const vacations = await this.vacationRepository.findByEmployeeAndYear(
      dto.employeeId,
      dto.year,
    );

    let used = 0;
    let pending = 0;
    for (const v of vacations) {
      const days = v.getDaysCountInYear(dto.year);
      if (v.status === 'APPROVED') used += days;
      else if (v.status === 'PENDING') pending += days;
      // REJECTED contributes nothing.
    }

    const available = ANNUAL_VACATION_DAYS - used - pending;

    return {
      employee_id: dto.employeeId,
      year: dto.year,
      total: ANNUAL_VACATION_DAYS,
      used,
      pending,
      available,
    };
  }
}
