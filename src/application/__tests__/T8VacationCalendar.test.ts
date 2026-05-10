/**
 * T8 — Vacation calendar view (use-case-level tests)
 *
 *   AC-1 · GET /api/vacations/calendar?year=YYYY&month=MM returns the full
 *          month grid (one entry per day).
 *   AC-2 · Optional ?area_id=<id> filters employees to that area only.
 *   AC-3 · Includes vacations with status PENDING OR APPROVED (NOT REJECTED).
 *   AC-4 · Response shape:
 *          { year, month, days: [{date: 'YYYY-MM-DD',
 *            employees: [{id, name, status}]}] }.
 *   AC-5 · Cross-month vacations (start before / end after) appear in the
 *          days that fall inside the requested month.
 *   AC-6 · Days with no vacationing employees return employees: [].
 *
 * Route handler at src/app/api/vacations/calendar/route.ts is a thin wrapper
 * over GetVacationCalendarUseCase that validates ?year=YYYY&month=MM via
 * regex. Covering the use case here also covers the route's behaviour.
 */

import { Employee } from '@/domain/entities/Employee';
import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type {
  FindEmployeesFilter,
  IEmployeeRepository,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import { GetVacationCalendarUseCase } from '../use-cases/vacation/GetVacationCalendarUseCase';

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
    filter?: FindEmployeesFilter,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<Employee>> {
    let items = [...this.store.values()];
    if (filter?.areaId !== undefined) {
      items = items.filter((e) => e.areaId === filter.areaId);
    }
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
  async findById(id: string): Promise<Vacation | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmployeeOverlapping(
    employeeId: string,
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
  ): Promise<Vacation[]> {
    return [...this.store.values()]
      .filter((v) => v.employeeId === employeeId)
      .filter((v) => v.startDate.getTime() <= to.getTime() && v.endDate.getTime() >= from.getTime())
      .filter((v) => !statuses || statuses.includes(v.status))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }
  async findOverlapping(
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
  ): Promise<Vacation[]> {
    return [...this.store.values()]
      .filter((v) => v.startDate.getTime() <= to.getTime() && v.endDate.getTime() >= from.getTime())
      .filter((v) => !statuses || statuses.includes(v.status))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEmployee(id: string, areaId: string | null, firstName = 'Ana', lastName = 'García'): Employee {
  const now = new Date('2025-01-01T00:00:00Z');
  return Employee.create({
    id,
    firstName,
    lastName,
    email: Email.create(`${id}@workhub.com`),
    phone: null,
    position: 'Engineer',
    salary: Money.create(1, 'EUR'),
    status: EmployeeStatus.ACTIVE,
    hireDate: now,
    areaId,
    createdAt: now,
    updatedAt: now,
  });
}

function makeVacation(
  id: string,
  employeeId: string,
  startIso: string,
  endIso: string,
  status: VacationStatus = 'APPROVED',
): Vacation {
  return Vacation.create({
    id,
    employeeId,
    startDate: new Date(`${startIso}T00:00:00Z`),
    endDate: new Date(`${endIso}T00:00:00Z`),
    status,
  });
}

const AREA_ENG = '00000000-0000-0000-0000-0000000a0001';
const AREA_HR = '00000000-0000-0000-0000-0000000a0002';
const EMP_A = '00000000-0000-0000-0000-0000000e0001';
const EMP_B = '00000000-0000-0000-0000-0000000e0002';
const EMP_C = '00000000-0000-0000-0000-0000000e0003';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('T8 — Vacation calendar view', () => {
  let employeeRepo: FakeEmployeeRepository;
  let vacationRepo: FakeVacationRepository;
  let useCase: GetVacationCalendarUseCase;

  beforeEach(() => {
    employeeRepo = new FakeEmployeeRepository();
    vacationRepo = new FakeVacationRepository();
    useCase = new GetVacationCalendarUseCase(employeeRepo, vacationRepo);
  });

  describe('AC-1 — full-month grid', () => {
    it('returns one entry per day for the requested month', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana', 'García'));
      await vacationRepo.save(makeVacation('v1', EMP_A, '2025-06-10', '2025-06-12'));

      const result = await useCase.execute({ year: 2025, month: 6 });

      expect(result.year).toBe(2025);
      expect(result.month).toBe(6);
      expect(result.days).toHaveLength(30);
      expect(result.days[0]?.date).toBe('2025-06-01');
      expect(result.days[29]?.date).toBe('2025-06-30');
    });

    it('returns 31 days for January and 28 for non-leap February', async () => {
      const jan = await useCase.execute({ year: 2025, month: 1 });
      expect(jan.days).toHaveLength(31);
      expect(jan.days[30]?.date).toBe('2025-01-31');

      const feb = await useCase.execute({ year: 2025, month: 2 });
      expect(feb.days).toHaveLength(28);

      const febLeap = await useCase.execute({ year: 2024, month: 2 });
      expect(febLeap.days).toHaveLength(29);
    });

    it('rejects an invalid month with DomainValidationError (400)', async () => {
      await expect(useCase.execute({ year: 2025, month: 13 })).rejects.toBeInstanceOf(
        DomainValidationError,
      );
      await expect(useCase.execute({ year: 2025, month: 0 })).rejects.toBeInstanceOf(
        DomainValidationError,
      );
    });
  });

  describe('AC-2 — optional area_id filter', () => {
    it('lists only employees in the requested area', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana'));
      await employeeRepo.save(makeEmployee(EMP_B, AREA_HR, 'Bea'));
      await vacationRepo.save(makeVacation('v1', EMP_A, '2025-06-10', '2025-06-10'));
      await vacationRepo.save(makeVacation('v2', EMP_B, '2025-06-10', '2025-06-10'));

      const eng = await useCase.execute({ year: 2025, month: 6, areaId: AREA_ENG });
      const day10Eng = eng.days.find((d) => d.date === '2025-06-10')!;
      expect(day10Eng.employees.map((e) => e.id)).toEqual([EMP_A]);

      const hr = await useCase.execute({ year: 2025, month: 6, areaId: AREA_HR });
      const day10Hr = hr.days.find((d) => d.date === '2025-06-10')!;
      expect(day10Hr.employees.map((e) => e.id)).toEqual([EMP_B]);
    });

    it('returns all employees when area_id is omitted', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana'));
      await employeeRepo.save(makeEmployee(EMP_B, AREA_HR, 'Bea'));
      await employeeRepo.save(makeEmployee(EMP_C, null, 'Cam'));
      await vacationRepo.save(makeVacation('v1', EMP_A, '2025-06-10', '2025-06-10'));
      await vacationRepo.save(makeVacation('v2', EMP_B, '2025-06-10', '2025-06-10'));
      await vacationRepo.save(makeVacation('v3', EMP_C, '2025-06-10', '2025-06-10'));

      const result = await useCase.execute({ year: 2025, month: 6 });
      const day10 = result.days.find((d) => d.date === '2025-06-10')!;
      expect(day10.employees.map((e) => e.id).sort()).toEqual([EMP_A, EMP_B, EMP_C].sort());
    });
  });

  describe('AC-3 — PENDING and APPROVED only, NOT REJECTED', () => {
    it('includes PENDING vacations', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana'));
      await vacationRepo.save(makeVacation('v1', EMP_A, '2025-06-15', '2025-06-15', 'PENDING'));

      const result = await useCase.execute({ year: 2025, month: 6 });
      const day15 = result.days.find((d) => d.date === '2025-06-15')!;
      expect(day15.employees).toHaveLength(1);
      expect(day15.employees[0]?.status).toBe('PENDING');
    });

    it('includes APPROVED vacations', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana'));
      await vacationRepo.save(makeVacation('v1', EMP_A, '2025-06-15', '2025-06-15', 'APPROVED'));

      const result = await useCase.execute({ year: 2025, month: 6 });
      const day15 = result.days.find((d) => d.date === '2025-06-15')!;
      expect(day15.employees).toHaveLength(1);
      expect(day15.employees[0]?.status).toBe('APPROVED');
    });

    it('excludes REJECTED vacations', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana'));
      const rejected = makeVacation('v1', EMP_A, '2025-06-15', '2025-06-15', 'PENDING');
      rejected.reject();
      await vacationRepo.save(rejected);

      const result = await useCase.execute({ year: 2025, month: 6 });
      for (const day of result.days) {
        expect(day.employees).toHaveLength(0);
      }
    });
  });

  describe('AC-4 — response shape { year, month, days: [{date, employees: [{id, name, status}]}] }', () => {
    it('emits the exact contracted shape', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana', 'García'));
      await vacationRepo.save(makeVacation('v1', EMP_A, '2025-06-10', '2025-06-10', 'APPROVED'));

      const result = await useCase.execute({ year: 2025, month: 6 });

      expect(Object.keys(result).sort()).toEqual(['days', 'month', 'year']);
      const day10 = result.days.find((d) => d.date === '2025-06-10')!;
      expect(Object.keys(day10).sort()).toEqual(['date', 'employees']);
      expect(day10.employees).toHaveLength(1);
      const emp = day10.employees[0]!;
      expect(Object.keys(emp).sort()).toEqual(['id', 'name', 'status']);
      expect(emp).toEqual({ id: EMP_A, name: 'Ana García', status: 'APPROVED' });
    });
  });

  describe('AC-5 — cross-month vacations clipped to the requested month', () => {
    it('vacation starting before the month appears only on its days within the month', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana'));
      await vacationRepo.save(makeVacation('v1', EMP_A, '2025-05-28', '2025-06-03'));

      const result = await useCase.execute({ year: 2025, month: 6 });
      const expectedDays = ['2025-06-01', '2025-06-02', '2025-06-03'];
      for (const day of result.days) {
        if (expectedDays.includes(day.date)) {
          expect(day.employees.map((e) => e.id)).toEqual([EMP_A]);
        } else {
          expect(day.employees).toHaveLength(0);
        }
      }
    });

    it('vacation ending after the month appears only on its days within the month', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana'));
      await vacationRepo.save(makeVacation('v1', EMP_A, '2025-06-29', '2025-07-03'));

      const result = await useCase.execute({ year: 2025, month: 6 });
      const expectedDays = ['2025-06-29', '2025-06-30'];
      for (const day of result.days) {
        if (expectedDays.includes(day.date)) {
          expect(day.employees.map((e) => e.id)).toEqual([EMP_A]);
        } else {
          expect(day.employees).toHaveLength(0);
        }
      }
    });

    it('vacation spanning the whole month appears every day', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana'));
      await vacationRepo.save(makeVacation('v1', EMP_A, '2025-05-15', '2025-07-15'));

      const result = await useCase.execute({ year: 2025, month: 6 });
      for (const day of result.days) {
        expect(day.employees.map((e) => e.id)).toEqual([EMP_A]);
      }
    });
  });

  describe('AC-6 — empty days return employees: []', () => {
    it('every day has employees: [] when no vacations exist', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana'));

      const result = await useCase.execute({ year: 2025, month: 6 });
      expect(result.days).toHaveLength(30);
      for (const day of result.days) {
        expect(day.employees).toEqual([]);
      }
    });

    it('mixes populated and empty days correctly', async () => {
      await employeeRepo.save(makeEmployee(EMP_A, AREA_ENG, 'Ana'));
      await vacationRepo.save(makeVacation('v1', EMP_A, '2025-06-10', '2025-06-12'));

      const result = await useCase.execute({ year: 2025, month: 6 });
      const populated = ['2025-06-10', '2025-06-11', '2025-06-12'];
      for (const day of result.days) {
        if (populated.includes(day.date)) {
          expect(day.employees).toHaveLength(1);
        } else {
          expect(day.employees).toEqual([]);
        }
      }
    });
  });
});
