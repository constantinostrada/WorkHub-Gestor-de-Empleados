/**
 * TransferEmployeeUseCase — T18
 *
 * Moves an Employee from one Area to another. Past TimeEntries and in-flight
 * APPROVED Vacations are NOT mutated — they are reported in the response so
 * the caller can audit downstream effects. The use case enforces:
 *   - employee exists
 *   - employee is not offboarded (EmployeeOffboardedError → 422)
 *   - target area exists (DomainNotFoundError('Area') → 404)
 *   - target area differs from current (SameAreaTransferError → 422)
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import type {
  AffectedTimeEntryDto,
  AffectedVacationDto,
  TransferEmployeeDto,
  TransferEmployeeResultDto,
} from '../../dtos/employee.dto';
import { EmployeeMapper } from '../../mappers/EmployeeMapper';

const FAR_FUTURE_TIME_ENTRY = new Date(Date.UTC(9999, 11, 31));

export class TransferEmployeeUseCase {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly areaRepository: IAreaRepository,
    private readonly vacationRepository: IVacationRepository,
    private readonly timeEntryRepository: ITimeEntryRepository,
  ) {}

  async execute(dto: TransferEmployeeDto): Promise<TransferEmployeeResultDto> {
    const employee = await this.employeeRepository.findById(dto.employeeId);
    if (!employee) {
      throw new DomainNotFoundError('Employee', dto.employeeId);
    }

    // Guard target area BEFORE asking the entity to transfer so the 404
    // for an unknown area takes precedence over the 422 same-area check.
    // But the entity-level offboarded check happens inside transferToArea —
    // we still want EMPLOYEE_OFFBOARDED to fire before AREA_NOT_FOUND so
    // a write against an offboarded employee is rejected without touching
    // the area table. Therefore: pre-flight isOffboarded here.
    if (employee.isOffboarded) {
      // Delegate to the entity so the error type is consistent and there's
      // exactly one place that decides what "offboarded" means.
      employee.transferToArea(dto.newAreaId);
    }

    const targetArea = await this.areaRepository.findById(dto.newAreaId);
    if (!targetArea) {
      throw new DomainNotFoundError('Area', dto.newAreaId);
    }

    // Snapshot the previous areaId before the entity mutates it (the entity
    // is immutable — transferToArea returns a NEW instance — so we keep both).
    const previousAreaId = employee.areaId;
    const transferredAt = new Date();

    // Side-effect inventory (read-only): we do NOT mutate vacations or time
    // entries. Past entries keep their historical Employee.areaId association
    // (via the audit log timeline) and future entries will be attributed to
    // the new area through the Employee.areaId join.
    const onOrAfterEntries = await this.timeEntryRepository.findByEmployeeInRange(
      employee.id,
      dto.effectiveDate,
      FAR_FUTURE_TIME_ENTRY,
    );
    const approvedCrossing = await this.vacationRepository.findByEmployeeOverlapping(
      employee.id,
      dto.effectiveDate,
      dto.effectiveDate,
      ['APPROVED'],
    );

    const transferred = employee.transferToArea(dto.newAreaId);
    await this.employeeRepository.update(transferred);

    const affected_vacations: AffectedVacationDto[] = approvedCrossing.map((v) => ({
      id: v.id,
      start_date: v.startDate.toISOString(),
      end_date: v.endDate.toISOString(),
      status: v.status,
    }));
    const affected_time_entries: AffectedTimeEntryDto[] = onOrAfterEntries.map((e) => ({
      id: e.id,
      date: e.date.toISOString(),
    }));

    return {
      employee: EmployeeMapper.toResponseDto(transferred),
      transferred_at: transferredAt.toISOString(),
      transferred_from: previousAreaId,
      transferred_to: dto.newAreaId,
      effective_date: dto.effectiveDate.toISOString(),
      affected_vacations,
      affected_time_entries,
    };
  }
}
