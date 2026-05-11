/**
 * OffboardEmployeeUseCase
 *
 * Soft-deactivates an employee and cascades the effect:
 *   - flips Employee.offboardedAt → `now`
 *   - cancels every PENDING vacation the employee holds, with a
 *     system-generated reason (so audit/UI can tell apart user-cancelled
 *     and system-cancelled vacations).
 *
 * AC mapping (T13):
 *   - AC-2: returns the updated employee DTO (offboarded=true + offboardedAt).
 *   - AC-4: cancels PENDING vacations and exposes the list to the route so
 *     it can write one audit entry per cancellation.
 *   - AC-9: throws EmployeeAlreadyOffboardedError when offboarded twice
 *     (mapped by the route to HTTP 409 with code EMPLOYEE_ALREADY_OFFBOARDED).
 */

import type { EmployeeResponseDto } from '@/application/dtos/employee.dto';
import { EmployeeMapper } from '@/application/mappers/EmployeeMapper';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';
import type { VacationStatus } from '@/domain/entities/Vacation';

export interface OffboardEmployeeDto {
  employeeId: string;
  now: Date;
}

export interface OffboardEmployeeCancelledVacation {
  id: string;
  status_before: VacationStatus;
  cancelled_at: string;
  reason: string;
}

export interface OffboardEmployeeResult {
  employee: EmployeeResponseDto;
  cancelledVacations: OffboardEmployeeCancelledVacation[];
}

export const OFFBOARD_VACATION_REASON =
  'Auto-cancelled because employee was offboarded.';

export class OffboardEmployeeUseCase {
  constructor(
    private readonly employeeRepo: IEmployeeRepository,
    private readonly vacationRepo: IVacationRepository,
  ) {}

  async execute(dto: OffboardEmployeeDto): Promise<OffboardEmployeeResult> {
    const employee = await this.employeeRepo.findById(dto.employeeId);
    if (!employee) {
      throw new DomainNotFoundError('Employee', dto.employeeId);
    }

    // Domain entity guards against double offboard (AC-9). Throws
    // EmployeeAlreadyOffboardedError which the route maps to 409.
    const offboarded = employee.offboard(dto.now);
    await this.employeeRepo.update(offboarded);

    // AC-4: cascade-cancel every PENDING vacation. APPROVED ones are NOT
    // touched (the AC only mentions PENDING). Use a wide overlap window so
    // any PENDING vacation for this employee — past, present, future — is
    // captured.
    const FAR_PAST = new Date(Date.UTC(1970, 0, 1));
    const FAR_FUTURE = new Date(Date.UTC(9999, 11, 31));
    const pendingVacations = await this.vacationRepo.findByEmployeeOverlapping(
      dto.employeeId,
      FAR_PAST,
      FAR_FUTURE,
      ['PENDING'],
    );

    const cancelledVacations: OffboardEmployeeCancelledVacation[] = [];
    for (const vacation of pendingVacations) {
      const statusBefore = vacation.status;
      vacation.cancelForOffboard(dto.now, OFFBOARD_VACATION_REASON);
      await this.vacationRepo.save(vacation);
      cancelledVacations.push({
        id: vacation.id,
        status_before: statusBefore,
        cancelled_at: dto.now.toISOString(),
        reason: OFFBOARD_VACATION_REASON,
      });
    }

    return {
      employee: EmployeeMapper.toResponseDto(offboarded),
      cancelledVacations,
    };
  }
}
