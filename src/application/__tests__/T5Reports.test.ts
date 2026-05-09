/**
 * T5 — Reportes
 *
 * Use-case-level tests for the three manager-facing reports. Route handlers
 * are thin wrappers that validate the YYYY/YYYY-MM query strings and delegate
 * to these use cases, so covering the use cases here also covers the routes.
 *
 *   AC-1 · GET /api/reports/hours-by-area?month=YYYY-MM
 *   AC-2 · GET /api/reports/vacations-summary?year=YYYY
 *   AC-3 · GET /api/reports/employee/:id/monthly?year=YYYY
 *   AC-4 · employees/areas with no activity still appear (zero-fill)
 *   AC-5 · ≥6 scenarios: empty month, partial month, full month, employee
 *          without area, area without employees, cross-year (Dec → Jan)
 */

import { Area } from '@/domain/entities/Area';
import { Employee } from '@/domain/entities/Employee';
import { TimeEntry } from '@/domain/entities/TimeEntry';
import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type {
  FindEmployeesFilter,
  IEmployeeRepository,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import { GetEmployeeMonthlyReportUseCase } from '../use-cases/report/GetEmployeeMonthlyReportUseCase';
import { HoursByAreaReportUseCase } from '../use-cases/report/HoursByAreaReportUseCase';
import { VacationsSummaryReportUseCase } from '../use-cases/report/VacationsSummaryReportUseCase';

// ── In-memory fakes ─────────────────────────────────────────────────────────

class FakeAreaRepository implements IAreaRepository {
  readonly store: Map<string, Area> = new Map();

  async findById(id: string): Promise<Area | null> {
    return this.store.get(id) ?? null;
  }
  async findByName(name: string): Promise<Area | null> {
    for (const a of this.store.values()) if (a.name === name) return a;
    return null;
  }
  async findAll(): Promise<Area[]> {
    return [...this.store.values()];
  }
  async save(area: Area): Promise<void> {
    this.store.set(area.id, area);
  }
  async update(area: Area): Promise<void> {
    this.store.set(area.id, area);
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
  async existsById(id: string): Promise<boolean> {
    return this.store.has(id);
  }
}

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
  async saveMany(employees: Employee[]): Promise<void> {
    for (const e of employees) this.store.set(e.id, e);
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

class FakeTimeEntryRepository implements ITimeEntryRepository {
  readonly store: Map<string, TimeEntry> = new Map();

  private static dayKey(employeeId: string, date: Date): string {
    const day = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    return `${employeeId}|${day.toISOString().slice(0, 10)}`;
  }

  async save(entry: TimeEntry): Promise<void> {
    this.store.set(FakeTimeEntryRepository.dayKey(entry.employeeId, entry.date), entry);
  }
  async findByEmployeeAndDate(employeeId: string, date: Date): Promise<TimeEntry | null> {
    return this.store.get(FakeTimeEntryRepository.dayKey(employeeId, date)) ?? null;
  }
  async findByEmployeeInRange(
    employeeId: string,
    from: Date,
    to: Date,
  ): Promise<TimeEntry[]> {
    const fromMs = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const toMs = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return [...this.store.values()]
      .filter((e) => {
        if (e.employeeId !== employeeId) return false;
        const t = e.date.getTime();
        return t >= fromMs && t <= toMs;
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
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

function makeArea(id: string, name: string): Area {
  const now = new Date('2025-01-01T00:00:00Z');
  return Area.create({
    id,
    name,
    description: null,
    managerId: null,
    createdAt: now,
    updatedAt: now,
  });
}

function makeEmployee(id: string, areaId: string | null, firstName = 'Ana'): Employee {
  const now = new Date('2025-01-01T00:00:00Z');
  return Employee.create({
    id,
    firstName,
    lastName: 'García',
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

function makeTimeEntry(id: string, employeeId: string, isoDate: string, hours: number): TimeEntry {
  const created = new Date('2025-01-01T00:00:00Z');
  return TimeEntry.create({
    id,
    employeeId,
    date: new Date(`${isoDate}T00:00:00Z`),
    hours,
    notes: null,
    createdAt: created,
    updatedAt: created,
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
const AREA_EMPTY = '00000000-0000-0000-0000-0000000a0003';
const EMP_A = '00000000-0000-0000-0000-0000000e0001';
const EMP_B = '00000000-0000-0000-0000-0000000e0002';
const EMP_NO_AREA = '00000000-0000-0000-0000-0000000e0003';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AC-1 · GET /api/reports/hours-by-area?month=YYYY-MM', () => {
  it('SCENARIO: empty month — every area appears with total_hours=0', async () => {
    const areas = new FakeAreaRepository();
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();

    await areas.save(makeArea(AREA_ENG, 'Engineering'));
    await areas.save(makeArea(AREA_HR, 'HR'));
    await employees.save(makeEmployee(EMP_A, AREA_ENG));
    await employees.save(makeEmployee(EMP_B, AREA_HR));
    // No time entries at all.

    const result = await new HoursByAreaReportUseCase(areas, employees, entries).execute({
      year: 2025,
      month: 4,
    });

    expect(result).toHaveLength(2);
    const eng = result.find((r) => r.area_id === AREA_ENG)!;
    const hr = result.find((r) => r.area_id === AREA_HR)!;
    expect(eng.area_name).toBe('Engineering');
    expect(eng.total_hours).toBe(0);
    expect(eng.employee_count).toBe(1);
    expect(hr.total_hours).toBe(0);
    expect(hr.employee_count).toBe(1);
  });

  it('SCENARIO: full month — sums hours per area for all employees', async () => {
    const areas = new FakeAreaRepository();
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();

    await areas.save(makeArea(AREA_ENG, 'Engineering'));
    await areas.save(makeArea(AREA_HR, 'HR'));
    await employees.save(makeEmployee(EMP_A, AREA_ENG));
    await employees.save(makeEmployee(EMP_B, AREA_HR));

    await entries.save(makeTimeEntry('t1', EMP_A, '2025-04-01', 8));
    await entries.save(makeTimeEntry('t2', EMP_A, '2025-04-15', 6.5));
    await entries.save(makeTimeEntry('t3', EMP_A, '2025-04-30', 4));
    await entries.save(makeTimeEntry('t4', EMP_B, '2025-04-10', 7));
    // March (out of month) and May (out of month) should be excluded.
    await entries.save(makeTimeEntry('t5', EMP_A, '2025-03-31', 10));
    await entries.save(makeTimeEntry('t6', EMP_B, '2025-05-01', 10));

    const result = await new HoursByAreaReportUseCase(areas, employees, entries).execute({
      year: 2025,
      month: 4,
    });

    const eng = result.find((r) => r.area_id === AREA_ENG)!;
    const hr = result.find((r) => r.area_id === AREA_HR)!;
    expect(eng.total_hours).toBe(18.5);
    expect(eng.employee_count).toBe(1);
    expect(hr.total_hours).toBe(7);
    expect(hr.employee_count).toBe(1);
  });

  it('SCENARIO: area without employees — appears with zeros', async () => {
    const areas = new FakeAreaRepository();
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();

    await areas.save(makeArea(AREA_ENG, 'Engineering'));
    await areas.save(makeArea(AREA_EMPTY, 'Pristine')); // no members
    await employees.save(makeEmployee(EMP_A, AREA_ENG));
    await entries.save(makeTimeEntry('t1', EMP_A, '2025-04-15', 8));

    const result = await new HoursByAreaReportUseCase(areas, employees, entries).execute({
      year: 2025,
      month: 4,
    });

    expect(result.map((r) => r.area_id).sort()).toEqual([AREA_ENG, AREA_EMPTY].sort());
    const empty = result.find((r) => r.area_id === AREA_EMPTY)!;
    expect(empty.area_name).toBe('Pristine');
    expect(empty.total_hours).toBe(0);
    expect(empty.employee_count).toBe(0);
  });

  it('SCENARIO: employee without area — their hours do NOT inflate any area total', async () => {
    const areas = new FakeAreaRepository();
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();

    await areas.save(makeArea(AREA_ENG, 'Engineering'));
    await employees.save(makeEmployee(EMP_A, AREA_ENG));
    await employees.save(makeEmployee(EMP_NO_AREA, null, 'Floating'));

    await entries.save(makeTimeEntry('t1', EMP_A, '2025-04-10', 8));
    await entries.save(makeTimeEntry('t2', EMP_NO_AREA, '2025-04-12', 5)); // must NOT count

    const result = await new HoursByAreaReportUseCase(areas, employees, entries).execute({
      year: 2025,
      month: 4,
    });

    expect(result).toHaveLength(1);
    const eng = result[0]!;
    expect(eng.area_id).toBe(AREA_ENG);
    expect(eng.total_hours).toBe(8);
    expect(eng.employee_count).toBe(1); // floating employee not counted
  });

  it('rejects an invalid month with DomainValidationError', async () => {
    const useCase = new HoursByAreaReportUseCase(
      new FakeAreaRepository(),
      new FakeEmployeeRepository(),
      new FakeTimeEntryRepository(),
    );
    await expect(useCase.execute({ year: 2025, month: 13 })).rejects.toBeInstanceOf(
      DomainValidationError,
    );
    await expect(useCase.execute({ year: 2025, month: 0 })).rejects.toBeInstanceOf(
      DomainValidationError,
    );
  });
});

describe('AC-2 · GET /api/reports/vacations-summary?year=YYYY', () => {
  it('SCENARIO: zero vacations — every employee still appears (days_available = 14)', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    await employees.save(makeEmployee(EMP_A, null, 'Alice'));
    await employees.save(makeEmployee(EMP_B, null, 'Bob'));

    const result = await new VacationsSummaryReportUseCase(employees, vacations).execute({
      year: 2025,
    });

    expect(result).toHaveLength(2);
    for (const row of result) {
      expect(row.days_taken).toBe(0);
      expect(row.days_pending).toBe(0);
      expect(row.days_available).toBe(14);
    }
    expect(result.find((r) => r.employee_id === EMP_A)!.name).toBe('Alice García');
    expect(result.find((r) => r.employee_id === EMP_B)!.name).toBe('Bob García');
  });

  it('sums approved vs pending days for the queried year and clamps days_available at 0', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    await employees.save(makeEmployee(EMP_A, null, 'Alice'));

    // 5 approved days (Apr 1-5), 3 pending days (Jun 10-12), inside 2025
    await vacations.save(makeVacation('v1', EMP_A, '2025-04-01', '2025-04-05', 'APPROVED'));
    await vacations.save(makeVacation('v2', EMP_A, '2025-06-10', '2025-06-12', 'PENDING'));
    // 12 more approved days (Aug 1-12) — total approved = 17 → days_available clamps to 0
    await vacations.save(makeVacation('v3', EMP_A, '2025-08-01', '2025-08-12', 'APPROVED'));

    const result = await new VacationsSummaryReportUseCase(employees, vacations).execute({
      year: 2025,
    });

    expect(result).toHaveLength(1);
    const row = result[0]!;
    expect(row.days_taken).toBe(17);
    expect(row.days_pending).toBe(3);
    expect(row.days_available).toBe(0); // 14 - 17 → clamped
  });

  it('SCENARIO: cross-year vacation reports only the days that fall in the queried year', async () => {
    const employees = new FakeEmployeeRepository();
    const vacations = new FakeVacationRepository();
    await employees.save(makeEmployee(EMP_A, null, 'Alice'));

    // Dec 30 2024 → Jan 3 2025 (5 days total): 2 in 2024, 3 in 2025
    await vacations.save(makeVacation('v1', EMP_A, '2024-12-30', '2025-01-03', 'APPROVED'));

    const for2024 = await new VacationsSummaryReportUseCase(employees, vacations).execute({
      year: 2024,
    });
    expect(for2024[0]!.days_taken).toBe(2); // Dec 30, Dec 31

    const for2025 = await new VacationsSummaryReportUseCase(employees, vacations).execute({
      year: 2025,
    });
    expect(for2025[0]!.days_taken).toBe(3); // Jan 1, Jan 2, Jan 3
    expect(for2025[0]!.days_available).toBe(11);
  });
});

describe('AC-3 · GET /api/reports/employee/:id/monthly?year=YYYY', () => {
  it('always returns a 12-element array, one row per month, with month numbers 1..12', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    const vacations = new FakeVacationRepository();
    await employees.save(makeEmployee(EMP_A, null));

    const result = await new GetEmployeeMonthlyReportUseCase(
      employees,
      entries,
      vacations,
    ).execute({ employeeId: EMP_A, year: 2025 });

    expect(result).toHaveLength(12);
    expect(result.map((r) => r.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const row of result) {
      expect(row.hours_worked).toBe(0);
      expect(row.vacation_days).toBe(0);
    }
  });

  it('SCENARIO: partial month — buckets hours into the right calendar month', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    const vacations = new FakeVacationRepository();
    await employees.save(makeEmployee(EMP_A, null));

    await entries.save(makeTimeEntry('t1', EMP_A, '2025-02-03', 8));
    await entries.save(makeTimeEntry('t2', EMP_A, '2025-02-04', 7.5));
    await entries.save(makeTimeEntry('t3', EMP_A, '2025-07-15', 6));
    // Time entry for a different year — must be ignored.
    await entries.save(makeTimeEntry('t4', EMP_A, '2024-12-31', 10));

    const result = await new GetEmployeeMonthlyReportUseCase(
      employees,
      entries,
      vacations,
    ).execute({ employeeId: EMP_A, year: 2025 });

    expect(result[1]!.hours_worked).toBe(15.5); // February
    expect(result[6]!.hours_worked).toBe(6); // July
    // Every other month is empty.
    for (const m of [0, 2, 3, 4, 5, 7, 8, 9, 10, 11]) {
      expect(result[m]!.hours_worked).toBe(0);
    }
  });

  it('SCENARIO: cross-year vacation Dec → Jan distributes days into both years correctly', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    const vacations = new FakeVacationRepository();
    await employees.save(makeEmployee(EMP_A, null));

    // Dec 28 2024 → Jan 4 2025: 4 days in 2024 (Dec 28-31), 4 days in 2025 (Jan 1-4)
    await vacations.save(makeVacation('v1', EMP_A, '2024-12-28', '2025-01-04', 'APPROVED'));

    const useCase = new GetEmployeeMonthlyReportUseCase(employees, entries, vacations);

    const r2024 = await useCase.execute({ employeeId: EMP_A, year: 2024 });
    expect(r2024[11]!.vacation_days).toBe(4); // December: 28, 29, 30, 31
    expect(r2024[0]!.vacation_days).toBe(0); // January 2024 untouched

    const r2025 = await useCase.execute({ employeeId: EMP_A, year: 2025 });
    expect(r2025[0]!.vacation_days).toBe(4); // January: 1, 2, 3, 4
    expect(r2025[11]!.vacation_days).toBe(0); // December 2025 untouched
  });

  it('only counts APPROVED vacations toward vacation_days (PENDING ignored)', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    const vacations = new FakeVacationRepository();
    await employees.save(makeEmployee(EMP_A, null));

    await vacations.save(makeVacation('v1', EMP_A, '2025-05-01', '2025-05-03', 'APPROVED'));
    await vacations.save(makeVacation('v2', EMP_A, '2025-05-10', '2025-05-15', 'PENDING'));
    await vacations.save(makeVacation('v3', EMP_A, '2025-05-20', '2025-05-22', 'REJECTED'));

    const result = await new GetEmployeeMonthlyReportUseCase(
      employees,
      entries,
      vacations,
    ).execute({ employeeId: EMP_A, year: 2025 });

    expect(result[4]!.vacation_days).toBe(3); // only the APPROVED 3 days in May
  });

  it('throws DomainNotFoundError when the employee does not exist', async () => {
    const employees = new FakeEmployeeRepository();
    const useCase = new GetEmployeeMonthlyReportUseCase(
      employees,
      new FakeTimeEntryRepository(),
      new FakeVacationRepository(),
    );
    await expect(
      useCase.execute({ employeeId: 'does-not-exist', year: 2025 }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});
