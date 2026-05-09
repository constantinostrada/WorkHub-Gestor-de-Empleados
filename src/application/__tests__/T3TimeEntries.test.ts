/**
 * T3 — Registro de horas trabajadas
 *
 * One describe per acceptance criterion. Tests run at the use-case level —
 * route handlers are thin pass-throughs that translate snake_case ↔ camelCase
 * and delegate to the same use cases exercised here.
 *
 *   AC-1 · POST /api/time-entries registers worked hours
 *   AC-2 · One entry per (employee, day) — 409 on duplicate
 *   AC-3 · hours must be in [0.5, 16] — 400 if outside
 *   AC-4 · date cannot be future — 400 if so
 *   AC-5 · employee_id must exist — 404 if not
 *   AC-6 · GET range is inclusive on both ends
 *   AC-7 · Response includes total_hours summed across the range
 */

import { Employee } from '@/domain/entities/Employee';
import { TimeEntry } from '@/domain/entities/TimeEntry';
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
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';

import { ListTimeEntriesByEmployeeUseCase } from '../use-cases/time-entry/ListTimeEntriesByEmployeeUseCase';
import { RegisterTimeEntryUseCase } from '../use-cases/time-entry/RegisterTimeEntryUseCase';

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

class FakeTimeEntryRepository implements ITimeEntryRepository {
  readonly store: Map<string, TimeEntry> = new Map();

  /** Same UTC-midnight truncation used by TimeEntry.toDateOnly. */
  private static dayKey(employeeId: string, date: Date): string {
    const day = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    return `${employeeId}|${day.toISOString().slice(0, 10)}`;
  }

  async save(entry: TimeEntry): Promise<void> {
    this.store.set(FakeTimeEntryRepository.dayKey(entry.employeeId, entry.date), entry);
  }
  async findByEmployeeAndDate(
    employeeId: string,
    date: Date,
  ): Promise<TimeEntry | null> {
    return this.store.get(FakeTimeEntryRepository.dayKey(employeeId, date)) ?? null;
  }
  async findByEmployeeInRange(
    employeeId: string,
    from: Date,
    to: Date,
  ): Promise<TimeEntry[]> {
    const fromMs = Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
    );
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

// ── Helpers ─────────────────────────────────────────────────────────────────

const EMP_ID = '00000000-0000-0000-0000-0000000000aa';

function seedEmployee(repo: FakeEmployeeRepository, id: string = EMP_ID): Employee {
  const now = new Date();
  const emp = Employee.create({
    id,
    firstName: 'Ana',
    lastName: 'García',
    email: Email.create(`${id}@workhub.com`),
    phone: null,
    position: 'Engineer',
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

/** Yesterday formatted as YYYY-MM-DD (UTC). Always a non-future date. */
function yesterdayIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Tomorrow formatted as YYYY-MM-DD (UTC). Always a future date. */
function tomorrowIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AC-1 · POST /api/time-entries registers worked hours', () => {
  it('persists an entry with employee_id, date, hours, notes', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);

    const result = await new RegisterTimeEntryUseCase(entries, employees).execute({
      employeeId: EMP_ID,
      date: yesterdayIso(),
      hours: 8,
      notes: 'Worked on T3',
    });

    expect(result.employee_id).toBe(EMP_ID);
    expect(result.date).toBe(yesterdayIso());
    expect(result.hours).toBe(8);
    expect(result.notes).toBe('Worked on T3');
    expect(entries.store.size).toBe(1);
  });

  it('persists an entry without notes (notes is optional)', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);

    const result = await new RegisterTimeEntryUseCase(entries, employees).execute({
      employeeId: EMP_ID,
      date: yesterdayIso(),
      hours: 7.5,
    });

    expect(result.notes).toBeNull();
    expect(result.hours).toBe(7.5);
  });
});

describe('AC-2 · One entry per (employee, day) — duplicate raises DomainConflictError (409)', () => {
  it('rejects the second registration on the same day with DomainConflictError', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);
    const useCase = new RegisterTimeEntryUseCase(entries, employees);

    await useCase.execute({ employeeId: EMP_ID, date: yesterdayIso(), hours: 8 });

    await expect(
      useCase.execute({ employeeId: EMP_ID, date: yesterdayIso(), hours: 4 }),
    ).rejects.toBeInstanceOf(DomainConflictError);

    // The original entry must NOT be silently overwritten.
    expect(entries.store.size).toBe(1);
    const stored = [...entries.store.values()][0]!;
    expect(stored.hours).toBe(8);
  });
});

describe('AC-3 · hours must be in [0.5, 16] — DomainValidationError (400) outside the range', () => {
  it('rejects hours below the minimum (0.49)', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);

    await expect(
      new RegisterTimeEntryUseCase(entries, employees).execute({
        employeeId: EMP_ID,
        date: yesterdayIso(),
        hours: 0.49,
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('rejects hours above the maximum (16.01)', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);

    await expect(
      new RegisterTimeEntryUseCase(entries, employees).execute({
        employeeId: EMP_ID,
        date: yesterdayIso(),
        hours: 16.01,
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('accepts the boundary values 0.5 and 16', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);
    const useCase = new RegisterTimeEntryUseCase(entries, employees);

    const low = await useCase.execute({
      employeeId: EMP_ID,
      date: yesterdayIso(),
      hours: 0.5,
    });
    expect(low.hours).toBe(0.5);

    // Different day so the (employee, day) uniqueness doesn't trip.
    const dayBefore = new Date();
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 2);
    const high = await useCase.execute({
      employeeId: EMP_ID,
      date: dayBefore.toISOString().slice(0, 10),
      hours: 16,
    });
    expect(high.hours).toBe(16);
  });
});

describe('AC-4 · date cannot be in the future — DomainValidationError (400)', () => {
  it('rejects a registration dated tomorrow', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);

    await expect(
      new RegisterTimeEntryUseCase(entries, employees).execute({
        employeeId: EMP_ID,
        date: tomorrowIso(),
        hours: 8,
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('accepts today (the boundary case — not future)', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);

    const today = new Date().toISOString().slice(0, 10);
    const result = await new RegisterTimeEntryUseCase(entries, employees).execute({
      employeeId: EMP_ID,
      date: today,
      hours: 8,
    });
    expect(result.date).toBe(today);
  });
});

describe('AC-5 · employee_id must exist — DomainNotFoundError (404)', () => {
  it('throws DomainNotFoundError when the employee does not exist', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();

    await expect(
      new RegisterTimeEntryUseCase(entries, employees).execute({
        employeeId: 'does-not-exist',
        date: yesterdayIso(),
        hours: 8,
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    expect(entries.store.size).toBe(0);
  });

  it('GET range also surfaces 404 when the employee does not exist', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();

    await expect(
      new ListTimeEntriesByEmployeeUseCase(entries, employees).execute({
        employeeId: 'does-not-exist',
        from: '2026-04-01',
        to: '2026-04-30',
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});

describe('AC-6 · GET range is inclusive on both ends', () => {
  it('returns entries on from, to, and any day between (and excludes outside)', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);
    const register = new RegisterTimeEntryUseCase(entries, employees);

    // Pick 5 fixed past dates so the test is deterministic regardless of "today".
    await register.execute({ employeeId: EMP_ID, date: '2025-03-30', hours: 4 }); // before window
    await register.execute({ employeeId: EMP_ID, date: '2025-04-01', hours: 8 }); // == from
    await register.execute({ employeeId: EMP_ID, date: '2025-04-15', hours: 6 }); // mid
    await register.execute({ employeeId: EMP_ID, date: '2025-04-30', hours: 5 }); // == to
    await register.execute({ employeeId: EMP_ID, date: '2025-05-01', hours: 7 }); // after window

    const result = await new ListTimeEntriesByEmployeeUseCase(entries, employees).execute(
      {
        employeeId: EMP_ID,
        from: '2025-04-01',
        to: '2025-04-30',
      },
    );

    expect(result.entries.map((e) => e.date)).toEqual([
      '2025-04-01',
      '2025-04-15',
      '2025-04-30',
    ]);
  });
});

describe('AC-7 · Response includes total_hours summed across the range', () => {
  it('returns { entries, total_hours } with the sum of hours in the range', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);
    const register = new RegisterTimeEntryUseCase(entries, employees);

    await register.execute({ employeeId: EMP_ID, date: '2025-04-01', hours: 8 });
    await register.execute({ employeeId: EMP_ID, date: '2025-04-02', hours: 7.5 });
    await register.execute({ employeeId: EMP_ID, date: '2025-04-03', hours: 4 });
    await register.execute({ employeeId: EMP_ID, date: '2025-05-15', hours: 6 }); // out of range

    const result = await new ListTimeEntriesByEmployeeUseCase(entries, employees).execute(
      {
        employeeId: EMP_ID,
        from: '2025-04-01',
        to: '2025-04-30',
      },
    );

    expect(result.entries).toHaveLength(3);
    expect(result.total_hours).toBe(19.5);
  });

  it('returns zero total_hours when the range is empty', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    seedEmployee(employees);

    const result = await new ListTimeEntriesByEmployeeUseCase(entries, employees).execute(
      {
        employeeId: EMP_ID,
        from: '2025-01-01',
        to: '2025-01-31',
      },
    );

    expect(result.entries).toEqual([]);
    expect(result.total_hours).toBe(0);
  });
});
