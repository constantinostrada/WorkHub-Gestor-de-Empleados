/**
 * T13 — Employee offboarding (soft-deactivation con cascading).
 *
 * AC-1 · POST /api/employees/:id/offboard exists, requires admin role
 *        (withRole(['admin']) → 403 for non-admin).
 * AC-2 · 200 with the updated employee DTO carrying offboarded=true and a
 *        non-null offboardedAt ISO timestamp.
 * AC-3 · POST /api/time-entries for an offboarded employee → 422 with
 *        body.code === 'EMPLOYEE_OFFBOARDED'.
 * AC-4 · All PENDING vacations of the employee transition to CANCELLED with
 *        the system-generated reason (OFFBOARD_VACATION_REASON). APPROVED
 *        vacations are NOT touched.
 * AC-5 · GET /api/employees defaults to excluding offboarded employees.
 * AC-6 · GET /api/employees?include=offboarded includes them.
 * AC-7 · Reports use cases honor includeOffboarded:
 *        - HoursByAreaReportUseCase: passes includeOffboarded to the
 *          employee filter so offboarded employees contribute zero by default.
 *        - GetEmployeeMonthlyReportUseCase: throws DomainNotFoundError when
 *          the target employee is offboarded and includeOffboarded is false.
 * AC-8 · Audit log: 1 entry with action='employee.offboarded' for the
 *        employee + 1 entry with action='vacation.cancelled' per cascaded
 *        cancellation.
 * AC-9 · Calling offboard on an already-offboarded employee → 409 with
 *        body.code === 'EMPLOYEE_ALREADY_OFFBOARDED'.
 */

import { Employee } from '@/domain/entities/Employee';
import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';
import { AuditLog } from '@/domain/entities/AuditLog';
import type {
  AuditLogPaginatedResult,
  FindAuditLogsFilter,
  FindAuditLogsPagination,
  IAuditLogRepository,
} from '@/domain/repositories/IAuditLogRepository';
import type {
  FindEmployeesFilter,
  IEmployeeRepository,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import { Area } from '@/domain/entities/Area';
import { TimeEntry } from '@/domain/entities/TimeEntry';

import {
  OFFBOARD_VACATION_REASON,
  OffboardEmployeeUseCase,
} from '../use-cases/employee/OffboardEmployeeUseCase';
import { ListEmployeesUseCase } from '../use-cases/employee/ListEmployeesUseCase';
import { HoursByAreaReportUseCase } from '../use-cases/report/HoursByAreaReportUseCase';
import { GetEmployeeMonthlyReportUseCase } from '../use-cases/report/GetEmployeeMonthlyReportUseCase';

// ── Fakes ───────────────────────────────────────────────────────────────────

class FakeEmployeeRepository implements IEmployeeRepository {
  readonly store = new Map<string, Employee>();
  saveCalls = 0;
  updateCalls = 0;

  async save(e: Employee): Promise<void> {
    this.saveCalls += 1;
    this.store.set(e.id, e);
  }
  async update(e: Employee): Promise<void> {
    this.updateCalls += 1;
    this.store.set(e.id, e);
  }
  async findById(id: string): Promise<Employee | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmail(_email: string): Promise<Employee | null> { return null; }
  async existsByEmail(_email: string): Promise<boolean> { return false; }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async findAll(
    filter?: FindEmployeesFilter,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<Employee>> {
    const all = Array.from(this.store.values());
    const includeOff = filter?.includeOffboarded ?? false;
    const filtered = all.filter((e) => includeOff || !e.isOffboarded);
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    };
  }
}

class FakeVacationRepository implements IVacationRepository {
  readonly store = new Map<string, Vacation>();
  saveCalls = 0;

  async save(v: Vacation): Promise<void> {
    this.saveCalls += 1;
    this.store.set(v.id, v);
  }
  async findById(id: string): Promise<Vacation | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmployeeOverlapping(
    employeeId: string,
    _from: Date,
    _to: Date,
    statuses?: VacationStatus[],
  ): Promise<Vacation[]> {
    const all = Array.from(this.store.values()).filter(
      (v) => v.employeeId === employeeId,
    );
    if (!statuses || statuses.length === 0) return all;
    return all.filter((v) => statuses.includes(v.status));
  }
  async findOverlapping(
    _from: Date,
    _to: Date,
    statuses?: VacationStatus[],
  ): Promise<Vacation[]> {
    const all = Array.from(this.store.values());
    if (!statuses || statuses.length === 0) return all;
    return all.filter((v) => statuses.includes(v.status));
  }
}

class FakeAuditLogRepository implements IAuditLogRepository {
  readonly store: AuditLog[] = [];
  async save(entry: AuditLog): Promise<void> {
    this.store.push(entry);
  }
  async findMany(
    _filter: FindAuditLogsFilter,
    _pagination: FindAuditLogsPagination,
  ): Promise<AuditLogPaginatedResult> {
    return { logs: [...this.store], total: this.store.length };
  }
}

class FakeTimeEntryRepository implements ITimeEntryRepository {
  readonly store: TimeEntry[] = [];
  async save(e: TimeEntry): Promise<void> { this.store.push(e); }
  async findByEmployeeAndDate(_emp: string, _date: Date): Promise<TimeEntry | null> {
    return null;
  }
  async findByEmployeeInRange(
    employeeId: string,
    from: Date,
    to: Date,
  ): Promise<TimeEntry[]> {
    return this.store.filter(
      (e) =>
        e.employeeId === employeeId &&
        e.date.getTime() >= from.getTime() &&
        e.date.getTime() <= to.getTime(),
    );
  }
}

class FakeAreaRepository implements IAreaRepository {
  readonly store = new Map<string, Area>();
  async save(a: Area): Promise<void> { this.store.set(a.id, a); }
  async update(a: Area): Promise<void> { this.store.set(a.id, a); }
  async findById(id: string): Promise<Area | null> {
    return this.store.get(id) ?? null;
  }
  async findByName(_name: string): Promise<Area | null> { return null; }
  async findAll(): Promise<Area[]> { return Array.from(this.store.values()); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsById(id: string): Promise<boolean> { return this.store.has(id); }
}

// ── Container mock — swap repositories for fakes ──────────────────────────

const fakeEmployeeRepo = new FakeEmployeeRepository();
const fakeVacationRepo = new FakeVacationRepository();
const fakeAuditRepo = new FakeAuditLogRepository();
const fakeTimeEntryRepo = new FakeTimeEntryRepository();
const fakeAreaRepo = new FakeAreaRepository();

jest.mock('@/infrastructure/container/container', () => {
  const {
    OffboardEmployeeUseCase: OffUC,
  } = jest.requireActual('../use-cases/employee/OffboardEmployeeUseCase');
  const {
    LogAuditEntryUseCase: LogUC,
  } = jest.requireActual('../use-cases/audit/LogAuditEntryUseCase');
  const {
    ListEmployeesUseCase: ListUC,
  } = jest.requireActual('../use-cases/employee/ListEmployeesUseCase');
  const {
    RegisterTimeEntryUseCase: RegUC,
  } = jest.requireActual('../use-cases/time-entry/RegisterTimeEntryUseCase');

  return {
    container: {
      offboardEmployee: new OffUC(fakeEmployeeRepo, fakeVacationRepo),
      logAuditEntry: new LogUC(fakeAuditRepo),
      listEmployees: new ListUC(fakeEmployeeRepo),
      registerTimeEntry: new RegUC(fakeTimeEntryRepo, fakeEmployeeRepo),
    },
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEmployee(overrides: Partial<{
  id: string;
  email: string;
  status: EmployeeStatus;
  offboardedAt: Date | null;
}> = {}): Employee {
  const now = new Date('2026-01-01T00:00:00Z');
  return Employee.create({
    id: overrides.id ?? 'emp-1',
    firstName: 'John',
    lastName: 'Doe',
    email: Email.create(overrides.email ?? 'john@example.com'),
    phone: null,
    position: 'Engineer',
    salary: Money.create(1000, 'USD'),
    status: overrides.status ?? EmployeeStatus.ACTIVE,
    hireDate: new Date('2025-01-01T00:00:00Z'),
    areaId: null,
    role: 'employee',
    offboardedAt: overrides.offboardedAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

function makeVacation(overrides: Partial<{
  id: string;
  employeeId: string;
  status: VacationStatus;
  startDate: Date;
  endDate: Date;
}> = {}): Vacation {
  return Vacation.create({
    id: overrides.id ?? 'vac-1',
    employeeId: overrides.employeeId ?? 'emp-1',
    startDate: overrides.startDate ?? new Date('2027-09-10T00:00:00Z'),
    endDate: overrides.endDate ?? new Date('2027-09-15T00:00:00Z'),
    status: overrides.status ?? 'PENDING',
  });
}

function makeRequest(opts: {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}): any {
  const headers = opts.headers ?? {};
  return {
    json: async () => opts.body ?? {},
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    nextUrl: { searchParams: new URLSearchParams(opts.query ?? {}) },
  };
}

const EMP_ID = '00000000-0000-0000-0000-0000000000a1';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000ac';

function resetFakes(): void {
  fakeEmployeeRepo.store.clear();
  fakeEmployeeRepo.saveCalls = 0;
  fakeEmployeeRepo.updateCalls = 0;
  fakeVacationRepo.store.clear();
  fakeVacationRepo.saveCalls = 0;
  fakeAuditRepo.store.length = 0;
  fakeTimeEntryRepo.store.length = 0;
  fakeAreaRepo.store.clear();
}

// ── AC-1 · role gating ─────────────────────────────────────────────────────

describe('AC-1 · POST /api/employees/:id/offboard requires admin role', () => {
  beforeEach(resetFakes);

  it('rejects non-admin (manager) with 403 + AC-11 body shape', async () => {
    const e = makeEmployee({ id: EMP_ID });
    await fakeEmployeeRepo.save(e);

    const { POST } = await import('@/app/api/employees/[id]/offboard/route');
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': ACTOR_ID, 'x-role': 'manager' } }),
      { params: { id: EMP_ID } },
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(body.required_roles).toEqual(['admin']);
    expect(body.your_role).toBe('manager');
    // Employee was NOT offboarded.
    expect(fakeEmployeeRepo.store.get(EMP_ID)?.isOffboarded).toBe(false);
  });

  it('rejects employee role with 403', async () => {
    const e = makeEmployee({ id: EMP_ID });
    await fakeEmployeeRepo.save(e);

    const { POST } = await import('@/app/api/employees/[id]/offboard/route');
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': ACTOR_ID, 'x-role': 'employee' } }),
      { params: { id: EMP_ID } },
    );
    expect(res.status).toBe(403);
  });

  it('accepts admin role and proceeds (route exists & wired)', async () => {
    const e = makeEmployee({ id: EMP_ID });
    await fakeEmployeeRepo.save(e);

    const { POST } = await import('@/app/api/employees/[id]/offboard/route');
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': ACTOR_ID, 'x-role': 'admin' } }),
      { params: { id: EMP_ID } },
    );
    expect(res.status).toBe(200);
  });
});

// ── AC-2 · response payload ────────────────────────────────────────────────

describe('AC-2 · 200 response carries offboarded=true + offboardedAt', () => {
  beforeEach(resetFakes);

  it('flips offboarded flag on the persisted entity and returns DTO', async () => {
    const e = makeEmployee({ id: EMP_ID });
    await fakeEmployeeRepo.save(e);

    const { POST } = await import('@/app/api/employees/[id]/offboard/route');
    const before = Date.now();
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': ACTOR_ID, 'x-role': 'admin' } }),
      { params: { id: EMP_ID } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(EMP_ID);
    expect(body.offboarded).toBe(true);
    expect(typeof body.offboardedAt).toBe('string');
    const offboardedTs = Date.parse(body.offboardedAt);
    expect(offboardedTs).toBeGreaterThanOrEqual(before);
    // Status downgraded to INACTIVE.
    expect(body.status).toBe(EmployeeStatus.INACTIVE);

    // Persistent entity reflects the change.
    const persisted = fakeEmployeeRepo.store.get(EMP_ID)!;
    expect(persisted.isOffboarded).toBe(true);
    expect(persisted.offboardedAt?.toISOString()).toBe(body.offboardedAt);
  });
});

// ── AC-3 · TimeEntry on offboarded employee → 422 EMPLOYEE_OFFBOARDED ────

describe('AC-3 · POST /api/time-entries for offboarded employee → 422 EMPLOYEE_OFFBOARDED', () => {
  beforeEach(resetFakes);

  it('returns 422 with code EMPLOYEE_OFFBOARDED', async () => {
    const offboardedAt = new Date('2026-04-01T00:00:00Z');
    const offboarded = makeEmployee({
      id: EMP_ID,
      status: EmployeeStatus.INACTIVE,
      offboardedAt,
    });
    await fakeEmployeeRepo.save(offboarded);

    const { POST } = await import('@/app/api/time-entries/route');
    const res = await POST(
      makeRequest({
        body: {
          employee_id: EMP_ID,
          date: '2026-04-15',
          hours: 8,
        },
      }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('EMPLOYEE_OFFBOARDED');
    expect(body.details?.employee_id).toBe(EMP_ID);
    expect(body.details?.offboarded_at).toBe(offboardedAt.toISOString());
    // No time entry persisted.
    expect(fakeTimeEntryRepo.store).toHaveLength(0);
  });

  it('still allows registering for an active employee (control)', async () => {
    const active = makeEmployee({ id: EMP_ID });
    await fakeEmployeeRepo.save(active);

    const { POST } = await import('@/app/api/time-entries/route');
    const res = await POST(
      makeRequest({
        body: {
          employee_id: EMP_ID,
          date: '2026-04-15',
          hours: 8,
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(fakeTimeEntryRepo.store).toHaveLength(1);
  });
});

// ── AC-4 · cascade-cancel PENDING vacations ────────────────────────────────

describe('AC-4 · PENDING vacations cascade-cancel with system reason', () => {
  beforeEach(resetFakes);

  it('cancels every PENDING vacation, sets reason, leaves APPROVED untouched', async () => {
    const e = makeEmployee({ id: EMP_ID });
    await fakeEmployeeRepo.save(e);

    const pending1 = makeVacation({ id: 'vac-pending-1', employeeId: EMP_ID, status: 'PENDING' });
    const pending2 = makeVacation({
      id: 'vac-pending-2',
      employeeId: EMP_ID,
      status: 'PENDING',
      startDate: new Date('2027-12-01T00:00:00Z'),
      endDate: new Date('2027-12-05T00:00:00Z'),
    });
    const approved = makeVacation({
      id: 'vac-approved',
      employeeId: EMP_ID,
      status: 'APPROVED',
      startDate: new Date('2027-10-01T00:00:00Z'),
      endDate: new Date('2027-10-05T00:00:00Z'),
    });
    await fakeVacationRepo.save(pending1);
    await fakeVacationRepo.save(pending2);
    await fakeVacationRepo.save(approved);

    const useCase = new OffboardEmployeeUseCase(fakeEmployeeRepo, fakeVacationRepo);
    const now = new Date('2026-05-11T10:00:00Z');
    const result = await useCase.execute({ employeeId: EMP_ID, now });

    // Both PENDING vacations are now CANCELLED with the system reason.
    const stored1 = fakeVacationRepo.store.get('vac-pending-1')!;
    const stored2 = fakeVacationRepo.store.get('vac-pending-2')!;
    expect(stored1.status).toBe('CANCELLED');
    expect(stored2.status).toBe('CANCELLED');
    expect(stored1.reason).toBe(OFFBOARD_VACATION_REASON);
    expect(stored2.reason).toBe(OFFBOARD_VACATION_REASON);
    expect(stored1.cancelledAt?.toISOString()).toBe(now.toISOString());

    // APPROVED vacation untouched.
    const storedApproved = fakeVacationRepo.store.get('vac-approved')!;
    expect(storedApproved.status).toBe('APPROVED');
    expect(storedApproved.reason).toBe(null);

    // Result exposes the cascaded cancellations for the route to audit.
    expect(result.cancelledVacations).toHaveLength(2);
    const ids = result.cancelledVacations.map((v) => v.id).sort();
    expect(ids).toEqual(['vac-pending-1', 'vac-pending-2']);
    for (const cv of result.cancelledVacations) {
      expect(cv.status_before).toBe('PENDING');
      expect(cv.reason).toBe(OFFBOARD_VACATION_REASON);
      expect(cv.cancelled_at).toBe(now.toISOString());
    }
  });

  it('cancels even past-start PENDING vacations (privileged system action)', async () => {
    const e = makeEmployee({ id: EMP_ID });
    await fakeEmployeeRepo.save(e);
    // PENDING vacation whose start date is in the past — Vacation.cancel()
    // would reject this with VacationAlreadyStartedError, but
    // Vacation.cancelForOffboard() is privileged and skips the check.
    const past = makeVacation({
      id: 'vac-past',
      employeeId: EMP_ID,
      status: 'PENDING',
      startDate: new Date('2020-01-01T00:00:00Z'),
      endDate: new Date('2020-01-05T00:00:00Z'),
    });
    await fakeVacationRepo.save(past);

    const useCase = new OffboardEmployeeUseCase(fakeEmployeeRepo, fakeVacationRepo);
    const result = await useCase.execute({ employeeId: EMP_ID, now: new Date() });

    expect(result.cancelledVacations).toHaveLength(1);
    expect(fakeVacationRepo.store.get('vac-past')?.status).toBe('CANCELLED');
  });
});

// ── AC-5 · default GET excludes offboarded ─────────────────────────────────

describe('AC-5 · GET /api/employees defaults to excluding offboarded', () => {
  beforeEach(resetFakes);

  it('excludes offboarded employees by default', async () => {
    const active = makeEmployee({ id: 'emp-active', email: 'a@x.com' });
    const offboarded = makeEmployee({
      id: 'emp-off',
      email: 'b@x.com',
      status: EmployeeStatus.INACTIVE,
      offboardedAt: new Date('2026-04-01T00:00:00Z'),
    });
    await fakeEmployeeRepo.save(active);
    await fakeEmployeeRepo.save(offboarded);

    const { GET } = await import('@/app/api/employees/route');
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((e: { id: string }) => e.id)).toEqual(['emp-active']);
    expect(body.total).toBe(1);
  });
});

// ── AC-6 · ?include=offboarded includes them ───────────────────────────────

describe('AC-6 · GET /api/employees?include=offboarded includes offboarded', () => {
  beforeEach(resetFakes);

  it('includes offboarded employees when ?include=offboarded is present', async () => {
    const active = makeEmployee({ id: 'emp-active', email: 'a@x.com' });
    const offboarded = makeEmployee({
      id: 'emp-off',
      email: 'b@x.com',
      status: EmployeeStatus.INACTIVE,
      offboardedAt: new Date('2026-04-01T00:00:00Z'),
    });
    await fakeEmployeeRepo.save(active);
    await fakeEmployeeRepo.save(offboarded);

    const { GET } = await import('@/app/api/employees/route');
    const res = await GET(makeRequest({ query: { include: 'offboarded' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.items.map((e: { id: string }) => e.id).sort();
    expect(ids).toEqual(['emp-active', 'emp-off']);
    expect(body.total).toBe(2);
    expect(body.items.find((e: { id: string }) => e.id === 'emp-off')!.offboarded).toBe(true);
  });
});

// ── AC-7 · Reports exclude offboarded by default ───────────────────────────

describe('AC-7 · Reports exclude offboarded employees by default', () => {
  beforeEach(resetFakes);

  it('HoursByAreaReport: offboarded employee\'s hours are not aggregated by default', async () => {
    const area = Area.create({
      id: 'area-1',
      name: 'Eng',
      description: null,
      managerId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await fakeAreaRepo.save(area);

    const active = Employee.create({
      id: 'emp-active',
      firstName: 'Act',
      lastName: 'Ive',
      email: Email.create('act@x.com'),
      phone: null,
      position: 'Eng',
      salary: Money.create(100, 'USD'),
      status: EmployeeStatus.ACTIVE,
      hireDate: new Date('2025-01-01T00:00:00Z'),
      areaId: 'area-1',
      role: 'employee',
      offboardedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const offboarded = Employee.create({
      id: 'emp-off',
      firstName: 'Off',
      lastName: 'Boarded',
      email: Email.create('off@x.com'),
      phone: null,
      position: 'Eng',
      salary: Money.create(100, 'USD'),
      status: EmployeeStatus.INACTIVE,
      hireDate: new Date('2025-01-01T00:00:00Z'),
      areaId: 'area-1',
      role: 'employee',
      offboardedAt: new Date('2026-04-01T00:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await fakeEmployeeRepo.save(active);
    await fakeEmployeeRepo.save(offboarded);

    fakeTimeEntryRepo.store.push(
      TimeEntry.create({
        id: 't1',
        employeeId: 'emp-active',
        date: new Date('2026-05-05T00:00:00Z'),
        hours: 8,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      TimeEntry.create({
        id: 't2',
        employeeId: 'emp-off',
        date: new Date('2026-05-06T00:00:00Z'),
        hours: 8,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const useCase = new HoursByAreaReportUseCase(
      fakeAreaRepo,
      fakeEmployeeRepo,
      fakeTimeEntryRepo,
    );
    // Default: exclude offboarded.
    const def = await useCase.execute({ year: 2026, month: 5 });
    expect(def[0]).toEqual({
      area_id: 'area-1',
      area_name: 'Eng',
      total_hours: 8,
      employee_count: 1,
    });

    // Opt-in: includeOffboarded=true → both employees counted.
    const inc = await useCase.execute({
      year: 2026,
      month: 5,
      includeOffboarded: true,
    });
    expect(inc[0]).toEqual({
      area_id: 'area-1',
      area_name: 'Eng',
      total_hours: 16,
      employee_count: 2,
    });
  });

  it('GetEmployeeMonthlyReport: offboarded employee → DomainNotFoundError by default', async () => {
    const offboarded = makeEmployee({
      id: EMP_ID,
      status: EmployeeStatus.INACTIVE,
      offboardedAt: new Date('2026-04-01T00:00:00Z'),
    });
    await fakeEmployeeRepo.save(offboarded);

    const useCase = new GetEmployeeMonthlyReportUseCase(
      fakeEmployeeRepo,
      fakeTimeEntryRepo,
      fakeVacationRepo,
    );

    await expect(
      useCase.execute({ employeeId: EMP_ID, year: 2026 }),
    ).rejects.toThrow(/Employee/);

    // Opt-in returns the report.
    const result = await useCase.execute({
      employeeId: EMP_ID,
      year: 2026,
      includeOffboarded: true,
    });
    expect(result).toHaveLength(12);
  });
});

// ── AC-8 · Audit log entries ───────────────────────────────────────────────

describe('AC-8 · Audit log: 1 employee.offboarded + 1 vacation.cancelled per cascade', () => {
  beforeEach(resetFakes);

  it('writes one audit row for the employee offboard and one per cascade', async () => {
    const e = makeEmployee({ id: EMP_ID });
    await fakeEmployeeRepo.save(e);
    await fakeVacationRepo.save(
      makeVacation({ id: 'vac-1', employeeId: EMP_ID, status: 'PENDING' }),
    );
    await fakeVacationRepo.save(
      makeVacation({
        id: 'vac-2',
        employeeId: EMP_ID,
        status: 'PENDING',
        startDate: new Date('2027-11-10T00:00:00Z'),
        endDate: new Date('2027-11-12T00:00:00Z'),
      }),
    );

    const { POST } = await import('@/app/api/employees/[id]/offboard/route');
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': ACTOR_ID, 'x-role': 'admin' } }),
      { params: { id: EMP_ID } },
    );
    expect(res.status).toBe(200);

    expect(fakeAuditRepo.store).toHaveLength(3); // 1 employee.offboarded + 2 vacation.cancelled

    const offboardEntry = fakeAuditRepo.store.find(
      (e) => e.action === 'employee.offboarded',
    )!;
    expect(offboardEntry).toBeDefined();
    expect(offboardEntry.actorId).toBe(ACTOR_ID);
    expect(offboardEntry.resourceType).toBe('employee');
    expect(offboardEntry.resourceId).toBe(EMP_ID);
    expect(offboardEntry.detailsJson.cancelled_vacation_ids).toEqual(
      expect.arrayContaining(['vac-1', 'vac-2']),
    );

    const vacationEntries = fakeAuditRepo.store.filter(
      (e) => e.action === 'vacation.cancelled',
    );
    expect(vacationEntries).toHaveLength(2);
    for (const ve of vacationEntries) {
      expect(ve.actorId).toBe(ACTOR_ID);
      expect(ve.resourceType).toBe('vacation');
      expect(ve.detailsJson.vacation_status_before).toBe('PENDING');
      expect(ve.detailsJson.reason).toBe(OFFBOARD_VACATION_REASON);
      expect(ve.detailsJson.cascade_from_employee_offboard).toBe(EMP_ID);
    }
    const vIds = vacationEntries.map((v) => v.resourceId).sort();
    expect(vIds).toEqual(['vac-1', 'vac-2']);
  });

  it('rejects 400 missing_actor_id when X-Actor-Id absent (no audit, no offboard)', async () => {
    const e = makeEmployee({ id: EMP_ID });
    await fakeEmployeeRepo.save(e);

    const { POST } = await import('@/app/api/employees/[id]/offboard/route');
    const res = await POST(
      makeRequest({ headers: { 'x-role': 'admin' } }),
      { params: { id: EMP_ID } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_actor_id');
    // Nothing changed.
    expect(fakeAuditRepo.store).toHaveLength(0);
    expect(fakeEmployeeRepo.store.get(EMP_ID)?.isOffboarded).toBe(false);
  });
});

// ── AC-9 · already-offboarded → 409 EMPLOYEE_ALREADY_OFFBOARDED ──────────

describe('AC-9 · offboard on already-offboarded employee → 409', () => {
  beforeEach(resetFakes);

  it('returns 409 with code EMPLOYEE_ALREADY_OFFBOARDED', async () => {
    const offboardedAt = new Date('2026-04-01T00:00:00Z');
    const offboarded = makeEmployee({
      id: EMP_ID,
      status: EmployeeStatus.INACTIVE,
      offboardedAt,
    });
    await fakeEmployeeRepo.save(offboarded);

    const { POST } = await import('@/app/api/employees/[id]/offboard/route');
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': ACTOR_ID, 'x-role': 'admin' } }),
      { params: { id: EMP_ID } },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('EMPLOYEE_ALREADY_OFFBOARDED');
    expect(body.details?.employee_id).toBe(EMP_ID);
    expect(body.details?.offboarded_at).toBe(offboardedAt.toISOString());

    // No audit entry written for the rejected attempt.
    expect(
      fakeAuditRepo.store.filter((e) => e.action === 'employee.offboarded'),
    ).toHaveLength(0);
  });
});
