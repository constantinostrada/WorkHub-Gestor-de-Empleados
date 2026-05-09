/**
 * T4 — Sistema de vacaciones con aprobación
 *
 * Use-case-level tests. Route handlers are thin pass-throughs that translate
 * snake_case ↔ camelCase and delegate to the use cases exercised here.
 *
 *   AC-1 · POST /api/vacations creates a request in PENDING status
 *   AC-2 · start_date <= end_date (otherwise 400)
 *   AC-3 · Range cannot overlap with another PENDING/APPROVED vacation (409)
 *   AC-4 · approve / reject only allowed from PENDING
 *   AC-5 · GET /api/employees/:id/vacation-balance returns {total:14, used, pending, available}
 *   AC-6 · GET /api/vacations?status=pending lists pending requests with embedded employee
 */

import { Employee } from '@/domain/entities/Employee';
import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import { DomainConflictError } from '@/domain/errors/DomainConflictError';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';
import type {
  FindEmployeesFilter,
  IEmployeeRepository,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import { ApproveVacationUseCase } from '../use-cases/vacation/ApproveVacationUseCase';
import { CreateVacationUseCase } from '../use-cases/vacation/CreateVacationUseCase';
import { GetVacationBalanceUseCase } from '../use-cases/vacation/GetVacationBalanceUseCase';
import { ListVacationsUseCase } from '../use-cases/vacation/ListVacationsUseCase';
import { RejectVacationUseCase } from '../use-cases/vacation/RejectVacationUseCase';

// ── In-memory fakes ─────────────────────────────────────────────────────────

class FakeEmployeeRepository implements IEmployeeRepository {
  readonly store: Map<string, Employee> = new Map();

  async findById(id: string): Promise<Employee | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmail(email: string): Promise<Employee | null> {
    for (const emp of this.store.values()) {
      if (emp.email.value === email) return emp;
    }
    return null;
  }
  async findAll(
    _filter?: FindEmployeesFilter,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<Employee>> {
    const items = [...this.store.values()];
    return {
      items,
      total: items.length,
      page: pagination?.page ?? 1,
      pageSize: pagination?.pageSize ?? 20,
      totalPages: 1,
    };
  }
  async save(employee: Employee): Promise<void> {
    this.store.set(employee.id, employee);
  }
  async update(employee: Employee): Promise<void> {
    this.store.set(employee.id, employee);
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
  async existsByEmail(email: string): Promise<boolean> {
    return (await this.findByEmail(email)) !== null;
  }
}

class FakeVacationRepository implements IVacationRepository {
  readonly store: Map<string, Vacation> = new Map();

  async save(vacation: Vacation): Promise<void> {
    this.store.set(vacation.id, vacation);
  }
  async update(vacation: Vacation): Promise<void> {
    this.store.set(vacation.id, vacation);
  }
  async findById(id: string): Promise<Vacation | null> {
    return this.store.get(id) ?? null;
  }
  async findOverlapping(
    employeeId: string,
    start: Date,
    end: Date,
    statuses: VacationStatus[],
    excludeId?: string,
  ): Promise<Vacation[]> {
    const startMs = Vacation.toDateOnly(start).getTime();
    const endMs = Vacation.toDateOnly(end).getTime();
    return [...this.store.values()].filter((v) => {
      if (v.employeeId !== employeeId) return false;
      if (excludeId && v.id === excludeId) return false;
      if (!statuses.includes(v.status)) return false;
      // Range overlap is inclusive on both ends.
      return v.startDate.getTime() <= endMs && v.endDate.getTime() >= startMs;
    });
  }
  async findByEmployeeAndYear(employeeId: string, year: number): Promise<Vacation[]> {
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year, 11, 31);
    return [...this.store.values()].filter((v) => {
      if (v.employeeId !== employeeId) return false;
      return v.startDate.getTime() <= yearEnd && v.endDate.getTime() >= yearStart;
    });
  }
  async findByStatus(status: VacationStatus): Promise<Vacation[]> {
    return [...this.store.values()]
      .filter((v) => v.status === status)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const EMP_ID = '00000000-0000-0000-0000-0000000000aa';

function seedEmployee(
  repo: FakeEmployeeRepository,
  id: string = EMP_ID,
  firstName = 'Ana',
  lastName = 'García',
  position = 'Engineer',
): Employee {
  const now = new Date();
  const emp = Employee.create({
    id,
    firstName,
    lastName,
    email: Email.create(`${id}@workhub.com`),
    phone: null,
    position,
    salary: Money.create(1, 'EUR'),
    status: EmployeeStatus.ACTIVE,
    hireDate: now,
    areaId: null,
    createdAt: now,
    updatedAt: now,
  });
  repo.store.set(emp.id, emp);
  return emp;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AC-1 · POST /api/vacations creates a request in PENDING status', () => {
  it('persists a vacation with status=pending and the provided fields', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);

    const result = await new CreateVacationUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      reason: 'Family trip',
    });

    expect(result.employee_id).toBe(EMP_ID);
    expect(result.start_date).toBe('2026-06-01');
    expect(result.end_date).toBe('2026-06-05');
    expect(result.reason).toBe('Family trip');
    expect(result.status).toBe('PENDING');
    expect(vacations.store.size).toBe(1);
  });

  it('persists a vacation without reason (reason is optional)', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);

    const result = await new CreateVacationUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      startDate: '2026-07-10',
      endDate: '2026-07-10',
    });

    expect(result.reason).toBeNull();
    expect(result.status).toBe('PENDING');
  });

  it('returns DomainNotFoundError when employee_id does not exist', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();

    await expect(
      new CreateVacationUseCase(vacations, employees).execute({
        employeeId: 'does-not-exist',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    expect(vacations.store.size).toBe(0);
  });
});

describe('AC-2 · start_date must be <= end_date — DomainValidationError (400)', () => {
  it('rejects a vacation whose start_date is after end_date', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);

    await expect(
      new CreateVacationUseCase(vacations, employees).execute({
        employeeId: EMP_ID,
        startDate: '2026-06-10',
        endDate: '2026-06-05',
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);
    expect(vacations.store.size).toBe(0);
  });

  it('accepts the boundary case where start_date == end_date (single-day vacation)', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);

    const result = await new CreateVacationUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      startDate: '2026-06-15',
      endDate: '2026-06-15',
    });
    expect(result.start_date).toBe('2026-06-15');
    expect(result.end_date).toBe('2026-06-15');
  });
});

describe('AC-3 · Range cannot overlap with PENDING/APPROVED vacation — DomainConflictError (409)', () => {
  it('rejects a new vacation that overlaps with an existing PENDING vacation', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const useCase = new CreateVacationUseCase(vacations, employees);

    await useCase.execute({
      employeeId: EMP_ID,
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });

    await expect(
      useCase.execute({
        employeeId: EMP_ID,
        startDate: '2026-06-05',
        endDate: '2026-06-15',
      }),
    ).rejects.toBeInstanceOf(DomainConflictError);

    expect(vacations.store.size).toBe(1);
  });

  it('rejects a new vacation that overlaps with an existing APPROVED vacation', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const create = new CreateVacationUseCase(vacations, employees);
    const approve = new ApproveVacationUseCase(vacations);

    const first = await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
    });
    await approve.execute({ vacationId: first.id });

    await expect(
      create.execute({
        employeeId: EMP_ID,
        startDate: '2026-08-10',
        endDate: '2026-08-15',
      }),
    ).rejects.toBeInstanceOf(DomainConflictError);
  });

  it('allows a new vacation that overlaps with a REJECTED-only vacation', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const create = new CreateVacationUseCase(vacations, employees);
    const reject = new RejectVacationUseCase(vacations);

    const first = await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-09-01',
      endDate: '2026-09-10',
    });
    await reject.execute({ vacationId: first.id });

    // Should NOT throw — the overlapping range was rejected and no longer blocks.
    const second = await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-09-05',
      endDate: '2026-09-15',
    });
    expect(second.status).toBe('PENDING');
    expect(vacations.store.size).toBe(2);
  });

  it('allows a non-overlapping vacation for the same employee', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const useCase = new CreateVacationUseCase(vacations, employees);

    await useCase.execute({
      employeeId: EMP_ID,
      startDate: '2026-06-01',
      endDate: '2026-06-05',
    });
    const second = await useCase.execute({
      employeeId: EMP_ID,
      startDate: '2026-06-06',
      endDate: '2026-06-10',
    });

    expect(second.status).toBe('PENDING');
    expect(vacations.store.size).toBe(2);
  });

  it('allows an overlapping vacation when it belongs to a different employee', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    const otherId = '00000000-0000-0000-0000-0000000000bb';
    seedEmployee(employees);
    seedEmployee(employees, otherId, 'Luis', 'Pérez');
    const useCase = new CreateVacationUseCase(vacations, employees);

    await useCase.execute({
      employeeId: EMP_ID,
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
    const other = await useCase.execute({
      employeeId: otherId,
      startDate: '2026-06-05',
      endDate: '2026-06-15',
    });

    expect(other.employee_id).toBe(otherId);
    expect(vacations.store.size).toBe(2);
  });
});

describe('AC-4 · approve / reject only allowed from PENDING', () => {
  it('PENDING → APPROVED transitions status to approved', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const created = await new CreateVacationUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      startDate: '2026-10-01',
      endDate: '2026-10-05',
    });

    const result = await new ApproveVacationUseCase(vacations).execute({
      vacationId: created.id,
    });

    expect(result.status).toBe('APPROVED');
    expect(vacations.store.get(created.id)?.status).toBe('APPROVED');
  });

  it('PENDING → REJECTED transitions status to rejected', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const created = await new CreateVacationUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      startDate: '2026-10-01',
      endDate: '2026-10-05',
    });

    const result = await new RejectVacationUseCase(vacations).execute({
      vacationId: created.id,
    });

    expect(result.status).toBe('REJECTED');
    expect(vacations.store.get(created.id)?.status).toBe('REJECTED');
  });

  it('APPROVED → APPROVED is rejected (DomainValidationError)', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const approve = new ApproveVacationUseCase(vacations);
    const created = await new CreateVacationUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      startDate: '2026-10-01',
      endDate: '2026-10-05',
    });
    await approve.execute({ vacationId: created.id });

    await expect(
      approve.execute({ vacationId: created.id }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('APPROVED → REJECTED is rejected (DomainValidationError)', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const created = await new CreateVacationUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      startDate: '2026-10-01',
      endDate: '2026-10-05',
    });
    await new ApproveVacationUseCase(vacations).execute({ vacationId: created.id });

    await expect(
      new RejectVacationUseCase(vacations).execute({ vacationId: created.id }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('REJECTED → APPROVED is rejected (DomainValidationError)', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const created = await new CreateVacationUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      startDate: '2026-10-01',
      endDate: '2026-10-05',
    });
    await new RejectVacationUseCase(vacations).execute({ vacationId: created.id });

    await expect(
      new ApproveVacationUseCase(vacations).execute({ vacationId: created.id }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('approve / reject surface DomainNotFoundError when :id does not exist', async () => {
    const vacations = new FakeVacationRepository();

    await expect(
      new ApproveVacationUseCase(vacations).execute({ vacationId: 'missing' }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    await expect(
      new RejectVacationUseCase(vacations).execute({ vacationId: 'missing' }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});

describe('AC-5 · GET /api/employees/:id/vacation-balance returns {total:14, used, pending, available}', () => {
  it('returns total=14 / used=0 / pending=0 / available=14 when no vacations', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);

    const result = await new GetVacationBalanceUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      year: 2026,
    });

    expect(result).toEqual({
      employee_id: EMP_ID,
      year: 2026,
      total: 14,
      used: 0,
      pending: 0,
      available: 14,
    });
  });

  it('counts approved days into used and pending days into pending', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const create = new CreateVacationUseCase(vacations, employees);
    const approve = new ApproveVacationUseCase(vacations);

    // 5 days approved (Jun 1 .. Jun 5 inclusive).
    const first = await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-06-01',
      endDate: '2026-06-05',
    });
    await approve.execute({ vacationId: first.id });

    // 3 days pending (Jul 10 .. Jul 12 inclusive).
    await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-07-10',
      endDate: '2026-07-12',
    });

    const result = await new GetVacationBalanceUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      year: 2026,
    });

    expect(result.total).toBe(14);
    expect(result.used).toBe(5);
    expect(result.pending).toBe(3);
    expect(result.available).toBe(6);
  });

  it('ignores REJECTED vacations in the balance', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const create = new CreateVacationUseCase(vacations, employees);
    const reject = new RejectVacationUseCase(vacations);

    const v = await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
    await reject.execute({ vacationId: v.id });

    const result = await new GetVacationBalanceUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      year: 2026,
    });
    expect(result.used).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.available).toBe(14);
  });

  it('clips a cross-year vacation to the requested year only', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const approve = new ApproveVacationUseCase(vacations);

    // Dec 30 2025 .. Jan 3 2026 inclusive = 5 total days,
    // of which 2 (Dec 30, Dec 31) belong to 2025 and 3 (Jan 1..3) belong to 2026.
    const v = await new CreateVacationUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      startDate: '2025-12-30',
      endDate: '2026-01-03',
    });
    await approve.execute({ vacationId: v.id });

    const balance2025 = await new GetVacationBalanceUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      year: 2025,
    });
    expect(balance2025.used).toBe(2);

    const balance2026 = await new GetVacationBalanceUseCase(vacations, employees).execute({
      employeeId: EMP_ID,
      year: 2026,
    });
    expect(balance2026.used).toBe(3);
  });

  it('returns DomainNotFoundError when the employee does not exist', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();

    await expect(
      new GetVacationBalanceUseCase(vacations, employees).execute({
        employeeId: 'missing',
        year: 2026,
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});

describe('AC-6 · GET /api/vacations?status=pending lists pending requests with embedded employee', () => {
  it('returns only PENDING vacations and embeds the employee summary', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const create = new CreateVacationUseCase(vacations, employees);
    const approve = new ApproveVacationUseCase(vacations);
    const reject = new RejectVacationUseCase(vacations);

    // One pending, one approved, one rejected — only the pending should appear.
    await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      reason: 'Pending one',
    });
    const toApprove = await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-07-01',
      endDate: '2026-07-03',
    });
    await approve.execute({ vacationId: toApprove.id });
    const toReject = await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
    });
    await reject.execute({ vacationId: toReject.id });

    const result = await new ListVacationsUseCase(vacations, employees).execute({
      status: 'PENDING',
    });

    expect(result).toHaveLength(1);
    const [only] = result;
    expect(only!.status).toBe('PENDING');
    expect(only!.reason).toBe('Pending one');
    expect(only!.employee).toEqual({
      id: EMP_ID,
      first_name: 'Ana',
      last_name: 'García',
      email: `${EMP_ID}@workhub.com`,
      position: 'Engineer',
    });
  });

  it('defaults to PENDING when no status filter is given', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    seedEmployee(employees);
    const create = new CreateVacationUseCase(vacations, employees);
    const approve = new ApproveVacationUseCase(vacations);

    await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-06-01',
      endDate: '2026-06-03',
    });
    const toApprove = await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-07-01',
      endDate: '2026-07-03',
    });
    await approve.execute({ vacationId: toApprove.id });

    const result = await new ListVacationsUseCase(vacations, employees).execute({});

    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('PENDING');
  });

  it('returns vacations from multiple employees with each one\'s embedded summary', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    const otherId = '00000000-0000-0000-0000-0000000000bb';
    seedEmployee(employees);
    seedEmployee(employees, otherId, 'Luis', 'Pérez', 'Designer');
    const create = new CreateVacationUseCase(vacations, employees);

    await create.execute({
      employeeId: EMP_ID,
      startDate: '2026-06-01',
      endDate: '2026-06-03',
    });
    await create.execute({
      employeeId: otherId,
      startDate: '2026-06-10',
      endDate: '2026-06-12',
    });

    const result = await new ListVacationsUseCase(vacations, employees).execute({
      status: 'PENDING',
    });

    expect(result).toHaveLength(2);
    const byEmployee = new Map(result.map((r) => [r.employee.id, r.employee]));
    expect(byEmployee.get(EMP_ID)?.first_name).toBe('Ana');
    expect(byEmployee.get(otherId)?.first_name).toBe('Luis');
    expect(byEmployee.get(otherId)?.position).toBe('Designer');
  });
});
