/**
 * T6 — Audit log endpoint
 *
 *   AC-1 · POST to /api/employees, /api/areas, /api/vacations, /api/time-entries
 *          writes a row in audit_logs with {actor_id, action, resource_type,
 *          resource_id, details_json, created_at}.
 *   AC-2 · GET /api/audit?since=ISO8601 — desc by created_at, filtered.
 *   AC-3 · GET /api/audit?actor=<employee_id> — filtered by actor.
 *   AC-4 · GET /api/audit?action=<verb> — filtered by action.
 *   AC-5 · Pagination: ?limit=N&offset=M (default 50, max 200).
 *   AC-6 · Response shape: { logs, total, has_more }.
 */

import type { Area } from '@/domain/entities/Area';
import { AuditLog, type AuditAction } from '@/domain/entities/AuditLog';
import { Employee } from '@/domain/entities/Employee';
import { Vacation } from '@/domain/entities/Vacation';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';
import type {
  AuditLogPaginatedResult,
  FindAuditLogsFilter,
  FindAuditLogsPagination,
  IAuditLogRepository,
} from '@/domain/repositories/IAuditLogRepository';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type {
  FindEmployeesFilter,
  IEmployeeRepository,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';
import { TimeEntry } from '@/domain/entities/TimeEntry';
import type { VacationStatus } from '@/domain/entities/Vacation';

import {
  AUDIT_DEFAULT_LIMIT,
  AUDIT_MAX_LIMIT,
  ListAuditLogsUseCase,
} from '../use-cases/audit/ListAuditLogsUseCase';
import { LogAuditEntryUseCase } from '../use-cases/audit/LogAuditEntryUseCase';

// ── Fake AuditLogRepository ────────────────────────────────────────────────

class FakeAuditLogRepository implements IAuditLogRepository {
  readonly store: AuditLog[] = [];

  async save(entry: AuditLog): Promise<void> {
    this.store.push(entry);
  }

  async findMany(
    filter: FindAuditLogsFilter,
    pagination: FindAuditLogsPagination,
  ): Promise<AuditLogPaginatedResult> {
    let filtered = [...this.store];
    if (filter.since) {
      const since = filter.since.getTime();
      filtered = filtered.filter((l) => l.createdAt.getTime() >= since);
    }
    if (filter.actorId) {
      filtered = filtered.filter((l) => l.actorId === filter.actorId);
    }
    if (filter.action) {
      filtered = filtered.filter((l) => l.action === filter.action);
    }
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = filtered.length;
    const logs = filtered.slice(pagination.offset, pagination.offset + pagination.limit);
    return { logs, total };
  }
}

// ── Fake repos for the resource POST routes ────────────────────────────────

class FakeEmployeeRepository implements IEmployeeRepository {
  readonly store = new Map<string, Employee>();
  async findById(id: string): Promise<Employee | null> { return this.store.get(id) ?? null; }
  async findByEmail(email: string): Promise<Employee | null> {
    for (const e of this.store.values()) if (e.email.value === email) return e;
    return null;
  }
  async findAll(_f?: FindEmployeesFilter, p?: PaginationOptions): Promise<PaginatedResult<Employee>> {
    const items = [...this.store.values()];
    return { items, total: items.length, page: p?.page ?? 1, pageSize: p?.pageSize ?? 20, totalPages: 1 };
  }
  async save(e: Employee): Promise<void> { this.store.set(e.id, e); }
  async update(e: Employee): Promise<void> { this.store.set(e.id, e); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsByEmail(email: string): Promise<boolean> { return (await this.findByEmail(email)) !== null; }
}

class FakeAreaRepository implements IAreaRepository {
  readonly store = new Map<string, Area>();
  async findById(id: string): Promise<Area | null> { return this.store.get(id) ?? null; }
  async findByName(name: string): Promise<Area | null> {
    for (const a of this.store.values()) if (a.name === name) return a;
    return null;
  }
  async findAll(): Promise<Area[]> { return [...this.store.values()]; }
  async save(a: Area): Promise<void> { this.store.set(a.id, a); }
  async update(a: Area): Promise<void> { this.store.set(a.id, a); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsById(id: string): Promise<boolean> { return this.store.has(id); }
  async existsByName(name: string): Promise<boolean> { return (await this.findByName(name)) !== null; }
}

class FakeTimeEntryRepository implements ITimeEntryRepository {
  readonly store = new Map<string, TimeEntry>();
  private static dayKey(eid: string, d: Date): string {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return `${eid}|${day.toISOString().slice(0, 10)}`;
  }
  async save(t: TimeEntry): Promise<void> { this.store.set(FakeTimeEntryRepository.dayKey(t.employeeId, t.date), t); }
  async findByEmployeeAndDate(eid: string, d: Date): Promise<TimeEntry | null> {
    return this.store.get(FakeTimeEntryRepository.dayKey(eid, d)) ?? null;
  }
  async findByEmployeeInRange(): Promise<TimeEntry[]> { return []; }
}

class FakeVacationRepository implements IVacationRepository {
  readonly store = new Map<string, Vacation>();
  async save(v: Vacation): Promise<void> { this.store.set(v.id, v); }
  async findById(id: string): Promise<Vacation | null> { return this.store.get(id) ?? null; }
  async findByEmployeeOverlapping(_e: string, _f: Date, _t: Date, _s?: VacationStatus[]): Promise<Vacation[]> {
    return [];
  }
  async findOverlapping(_f: Date, _t: Date, _s?: VacationStatus[]): Promise<Vacation[]> {
    return [];
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const ACTOR_ID = 'actor-employee-id';
const SUBJECT_EMP_ID = '00000000-0000-0000-0000-0000000000ee';

function makeEmployee(id: string, email: string): Employee {
  const now = new Date('2025-01-01T00:00:00.000Z');
  return Employee.create({
    id,
    firstName: 'Test',
    lastName: 'User',
    email: Email.create(email),
    phone: null,
    position: 'engineer',
    salary: Money.create(1, 'EUR'),
    status: EmployeeStatus.ACTIVE,
    hireDate: now,
    areaId: null,
    createdAt: now,
    updatedAt: now,
  });
}

// ── Mock the container so we can inject our fakes into route handlers ─────

const fakeAuditRepo = new FakeAuditLogRepository();
const fakeEmployeeRepo = new FakeEmployeeRepository();
const fakeAreaRepo = new FakeAreaRepository();
const fakeTimeEntryRepo = new FakeTimeEntryRepository();
const fakeVacationRepo = new FakeVacationRepository();

jest.mock('@/infrastructure/container/container', () => {
  // Lazy-required so the fakes above are initialised before the use cases.
  const {
    LogAuditEntryUseCase: LogUC,
  } = jest.requireActual('../use-cases/audit/LogAuditEntryUseCase');
  const {
    CreateEmployeeUseCase: CreateEmp,
  } = jest.requireActual('../use-cases/employee/CreateEmployeeUseCase');
  const {
    CreateAreaUseCase: CreateArea,
  } = jest.requireActual('../use-cases/area/CreateAreaUseCase');
  const {
    RegisterTimeEntryUseCase: RegisterTE,
  } = jest.requireActual('../use-cases/time-entry/RegisterTimeEntryUseCase');
  const {
    CreateVacationUseCase: CreateVac,
  } = jest.requireActual('../use-cases/vacation/CreateVacationUseCase');

  return {
    container: {
      logAuditEntry: new LogUC(fakeAuditRepo),
      createEmployee: new CreateEmp(fakeEmployeeRepo, fakeAreaRepo),
      createArea: new CreateArea(fakeAreaRepo),
      registerTimeEntry: new RegisterTE(fakeTimeEntryRepo, fakeEmployeeRepo),
      createVacation: new CreateVac(fakeVacationRepo, fakeEmployeeRepo),
    },
  };
});

// Build a NextRequest-compatible mock with headers + json + nextUrl.
function makeRequest(opts: {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}): any {
  const headers = opts.headers ?? {};
  return {
    json: async () => opts.body ?? {},
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
    nextUrl: {
      searchParams: new URLSearchParams(opts.query ?? {}),
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// AC-1 · POST routes write audit_logs rows
// ────────────────────────────────────────────────────────────────────────────

describe('AC-1 · POST routes write audit_logs rows', () => {
  beforeEach(() => {
    fakeAuditRepo.store.length = 0;
    fakeEmployeeRepo.store.clear();
    fakeAreaRepo.store.clear();
    fakeTimeEntryRepo.store.clear();
    fakeVacationRepo.store.clear();
  });

  it('AC-1a · POST /api/employees writes audit_log {actor_id, action=create, resource_type=employee, resource_id, details_json, created_at}', async () => {
    const { POST } = await import('@/app/api/employees/route');
    const before = Date.now();
    const res = await POST(makeRequest({
      body: { name: 'Jane Smith', email: 'jane@example.com', role: 'engineer' },
      headers: { 'x-actor-id': ACTOR_ID },
    }));
    expect(res.status).toBe(201);

    expect(fakeAuditRepo.store).toHaveLength(1);
    const log = fakeAuditRepo.store[0]!;
    expect(log.actorId).toBe(ACTOR_ID);
    expect(log.action).toBe<AuditAction>('create');
    expect(log.resourceType).toBe('employee');
    expect(log.resourceId).toBeTruthy();
    expect(log.detailsJson).toMatchObject({ name: 'Jane Smith', email: 'jane@example.com', role: 'engineer' });
    expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('AC-1b · POST /api/areas writes audit_log with resource_type=area', async () => {
    const { POST } = await import('@/app/api/areas/route');
    const res = await POST(makeRequest({
      body: { name: 'Engineering' },
      headers: { 'x-actor-id': ACTOR_ID },
    }));
    expect(res.status).toBe(201);
    expect(fakeAuditRepo.store).toHaveLength(1);
    const log = fakeAuditRepo.store[0]!;
    expect(log.actorId).toBe(ACTOR_ID);
    expect(log.action).toBe('create');
    expect(log.resourceType).toBe('area');
    expect(log.detailsJson).toMatchObject({ name: 'Engineering' });
  });

  it('AC-1c · POST /api/time-entries writes audit_log with resource_type=time_entry', async () => {
    const emp = makeEmployee(SUBJECT_EMP_ID, 'subject@example.com');
    await fakeEmployeeRepo.save(emp);
    const { POST } = await import('@/app/api/time-entries/route');
    const res = await POST(makeRequest({
      body: { employee_id: SUBJECT_EMP_ID, date: '2025-04-15', hours: 8 },
      headers: { 'x-actor-id': ACTOR_ID },
    }));
    expect(res.status).toBe(201);
    expect(fakeAuditRepo.store).toHaveLength(1);
    const log = fakeAuditRepo.store[0]!;
    expect(log.actorId).toBe(ACTOR_ID);
    expect(log.action).toBe('create');
    expect(log.resourceType).toBe('time_entry');
    expect(log.detailsJson).toMatchObject({ employee_id: SUBJECT_EMP_ID, date: '2025-04-15', hours: 8 });
  });

  it('AC-1d · POST /api/vacations writes audit_log with resource_type=vacation', async () => {
    const emp = makeEmployee(SUBJECT_EMP_ID, 'vac@example.com');
    await fakeEmployeeRepo.save(emp);
    const { POST } = await import('@/app/api/vacations/route');
    const res = await POST(makeRequest({
      body: { employee_id: SUBJECT_EMP_ID, start_date: '2025-08-01', end_date: '2025-08-05' },
      headers: { 'x-actor-id': ACTOR_ID },
    }));
    expect(res.status).toBe(201);
    expect(fakeAuditRepo.store).toHaveLength(1);
    const log = fakeAuditRepo.store[0]!;
    expect(log.actorId).toBe(ACTOR_ID);
    expect(log.action).toBe('create');
    expect(log.resourceType).toBe('vacation');
    expect(log.detailsJson).toMatchObject({
      employee_id: SUBJECT_EMP_ID,
      start_date: '2025-08-01',
      end_date: '2025-08-05',
    });
  });

  it('AC-1e · missing X-Actor-Id falls back to actor_id=null but still writes the row', async () => {
    const { POST } = await import('@/app/api/areas/route');
    const res = await POST(makeRequest({ body: { name: 'Operations' } }));
    expect(res.status).toBe(201);
    expect(fakeAuditRepo.store).toHaveLength(1);
    expect(fakeAuditRepo.store[0]!.actorId).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-2 · ?since
// ────────────────────────────────────────────────────────────────────────────

describe('AC-2 · GET /api/audit?since', () => {
  it('returns logs ordered desc by created_at and filters by since', async () => {
    const repo = new FakeAuditLogRepository();
    const log = (id: string, action: AuditAction, ts: string) => AuditLog.create({
      id,
      actorId: 'a1',
      action,
      resourceType: 'employee',
      resourceId: 'r1',
      detailsJson: {},
      createdAt: new Date(ts),
    });
    await repo.save(log('1', 'create', '2025-01-01T00:00:00.000Z'));
    await repo.save(log('2', 'update', '2025-01-05T00:00:00.000Z'));
    await repo.save(log('3', 'delete', '2025-01-10T00:00:00.000Z'));

    const uc = new ListAuditLogsUseCase(repo);
    const result = await uc.execute({ since: '2025-01-04T00:00:00.000Z' });
    expect(result.logs.map((l) => l.id)).toEqual(['3', '2']);
  });

  it('throws DomainValidationError for non-ISO since', async () => {
    const uc = new ListAuditLogsUseCase(new FakeAuditLogRepository());
    await expect(uc.execute({ since: 'not-a-date' })).rejects.toBeInstanceOf(DomainValidationError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-3 · ?actor
// ────────────────────────────────────────────────────────────────────────────

describe('AC-3 · GET /api/audit?actor', () => {
  it('filters by actor', async () => {
    const repo = new FakeAuditLogRepository();
    const make = (id: string, actor: string | null, ts: string) => AuditLog.create({
      id, actorId: actor, action: 'create', resourceType: 'employee', resourceId: 'r', detailsJson: {},
      createdAt: new Date(ts),
    });
    await repo.save(make('1', 'alice', '2025-01-01T00:00:00.000Z'));
    await repo.save(make('2', 'bob', '2025-01-02T00:00:00.000Z'));
    await repo.save(make('3', 'alice', '2025-01-03T00:00:00.000Z'));

    const uc = new ListAuditLogsUseCase(repo);
    const result = await uc.execute({ actor: 'alice' });
    expect(result.logs.map((l) => l.id)).toEqual(['3', '1']);
    expect(result.logs.every((l) => l.actor_id === 'alice')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-4 · ?action
// ────────────────────────────────────────────────────────────────────────────

describe('AC-4 · GET /api/audit?action', () => {
  it('filters by action verb', async () => {
    const repo = new FakeAuditLogRepository();
    const make = (id: string, action: AuditAction, ts: string) => AuditLog.create({
      id, actorId: 'a', action, resourceType: 'employee', resourceId: 'r', detailsJson: {},
      createdAt: new Date(ts),
    });
    await repo.save(make('1', 'create', '2025-01-01T00:00:00.000Z'));
    await repo.save(make('2', 'update', '2025-01-02T00:00:00.000Z'));
    await repo.save(make('3', 'delete', '2025-01-03T00:00:00.000Z'));
    await repo.save(make('4', 'update', '2025-01-04T00:00:00.000Z'));

    const uc = new ListAuditLogsUseCase(repo);
    const result = await uc.execute({ action: 'update' });
    expect(result.logs.map((l) => l.id)).toEqual(['4', '2']);
  });

  it('rejects unknown action verbs', async () => {
    const uc = new ListAuditLogsUseCase(new FakeAuditLogRepository());
    await expect(uc.execute({ action: 'frobnicate' })).rejects.toBeInstanceOf(DomainValidationError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-5 · pagination
// ────────────────────────────────────────────────────────────────────────────

describe('AC-5 · pagination', () => {
  function seed(repo: FakeAuditLogRepository, n: number): Promise<void[]> {
    const writes: Promise<void>[] = [];
    for (let i = 0; i < n; i++) {
      writes.push(repo.save(AuditLog.create({
        id: `id-${i}`,
        actorId: 'a',
        action: 'create',
        resourceType: 'employee',
        resourceId: `r-${i}`,
        detailsJson: {},
        createdAt: new Date(2025, 0, 1, 0, 0, 0, i), // strictly increasing ms
      })));
    }
    return Promise.all(writes);
  }

  it('defaults limit=50', async () => {
    const repo = new FakeAuditLogRepository();
    await seed(repo, 75);
    const uc = new ListAuditLogsUseCase(repo);
    const result = await uc.execute({});
    expect(AUDIT_DEFAULT_LIMIT).toBe(50);
    expect(result.logs).toHaveLength(50);
    expect(result.total).toBe(75);
    expect(result.has_more).toBe(true);
  });

  it('caps limit at 200', async () => {
    const repo = new FakeAuditLogRepository();
    await seed(repo, 250);
    const uc = new ListAuditLogsUseCase(repo);
    const result = await uc.execute({ limit: 500 });
    expect(AUDIT_MAX_LIMIT).toBe(200);
    expect(result.logs).toHaveLength(200);
    expect(result.total).toBe(250);
    expect(result.has_more).toBe(true);
  });

  it('honours explicit limit and offset', async () => {
    const repo = new FakeAuditLogRepository();
    await seed(repo, 10);
    const uc = new ListAuditLogsUseCase(repo);
    const result = await uc.execute({ limit: 3, offset: 4 });
    expect(result.logs).toHaveLength(3);
    expect(result.logs.map((l) => l.id)).toEqual(['id-5', 'id-4', 'id-3']); // desc by created_at
    expect(result.total).toBe(10);
    expect(result.has_more).toBe(true);
  });

  it('has_more=false when reaching the end', async () => {
    const repo = new FakeAuditLogRepository();
    await seed(repo, 10);
    const uc = new ListAuditLogsUseCase(repo);
    const result = await uc.execute({ limit: 5, offset: 7 });
    expect(result.logs).toHaveLength(3);
    expect(result.total).toBe(10);
    expect(result.has_more).toBe(false);
  });

  it('rejects negative or non-integer offset/limit', async () => {
    const uc = new ListAuditLogsUseCase(new FakeAuditLogRepository());
    await expect(uc.execute({ limit: 0 })).rejects.toBeInstanceOf(DomainValidationError);
    await expect(uc.execute({ limit: 1.5 })).rejects.toBeInstanceOf(DomainValidationError);
    await expect(uc.execute({ offset: -1 })).rejects.toBeInstanceOf(DomainValidationError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC-6 · response shape { logs, total, has_more }
// ────────────────────────────────────────────────────────────────────────────

describe('AC-6 · response shape', () => {
  it('returns { logs, total, has_more } with snake_case fields per row', async () => {
    const repo = new FakeAuditLogRepository();
    await repo.save(AuditLog.create({
      id: 'log-1',
      actorId: 'actor-1',
      action: 'create',
      resourceType: 'employee',
      resourceId: 'emp-1',
      detailsJson: { foo: 'bar' },
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
    }));

    const uc = new ListAuditLogsUseCase(repo);
    const result = await uc.execute({});

    expect(Object.keys(result).sort()).toEqual(['has_more', 'logs', 'total']);
    expect(result.total).toBe(1);
    expect(result.has_more).toBe(false);
    expect(result.logs).toHaveLength(1);
    const row = result.logs[0]!;
    expect(row).toEqual({
      id: 'log-1',
      actor_id: 'actor-1',
      action: 'create',
      resource_type: 'employee',
      resource_id: 'emp-1',
      details_json: { foo: 'bar' },
      created_at: '2025-06-01T12:00:00.000Z',
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// LogAuditEntryUseCase shape sanity
// ────────────────────────────────────────────────────────────────────────────

describe('LogAuditEntryUseCase', () => {
  it('persists a row with the AC-1 shape', async () => {
    const repo = new FakeAuditLogRepository();
    const uc = new LogAuditEntryUseCase(repo);
    await uc.execute({
      actorId: 'a-1',
      action: 'create',
      resourceType: 'employee',
      resourceId: 'r-1',
      detailsJson: { hello: 'world' },
    });
    expect(repo.store).toHaveLength(1);
    const e = repo.store[0]!;
    expect(e.actorId).toBe('a-1');
    expect(e.action).toBe('create');
    expect(e.resourceType).toBe('employee');
    expect(e.resourceId).toBe('r-1');
    expect(e.detailsJson).toEqual({ hello: 'world' });
    expect(e.createdAt).toBeInstanceOf(Date);
    expect(e.id).toBeTruthy();
  });

  it('rejects invalid action', async () => {
    const uc = new LogAuditEntryUseCase(new FakeAuditLogRepository());
    await expect(uc.execute({
      actorId: null,
      action: 'frobnicate' as AuditAction,
      resourceType: 'employee',
      resourceId: 'r',
    })).rejects.toBeInstanceOf(DomainValidationError);
  });
});
