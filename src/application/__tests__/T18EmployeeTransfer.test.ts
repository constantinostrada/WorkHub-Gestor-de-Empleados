/**
 * T18 — Employee cross-area transfer.
 *
 * POST /api/employees/:id/transfer moves an employee from one area to
 * another while leaving in-flight TimeEntries / Vacations untouched.
 *
 * Acceptance criteria covered in this suite:
 *   AC-1 · POST exists and requires role admin.
 *   AC-2 · Body { new_area_id, effective_date? } — effective_date defaults to now.
 *   AC-3 · 200 with { employee, transferred_at, transferred_from,
 *          transferred_to, affected_vacations, affected_time_entries }.
 *   AC-4 · new_area_id == current → 422 SAME_AREA.
 *   AC-5 · new_area_id missing in DB → 404 AREA_NOT_FOUND.
 *   AC-6 · Employee is offboarded → 422 EMPLOYEE_OFFBOARDED.
 *   AC-7 · TimeEntries with date < effective_date keep their old areaId
 *          (i.e. are NOT mutated); on/after → reported in affected_time_entries.
 *   AC-8 · PENDING vacations stay PENDING; APPROVED crossing effective_date
 *          are reported in affected_vacations but not modified.
 *   AC-9 · Audit log row employee.transferred with proper detailsJson.
 */

import { Area } from '@/domain/entities/Area';
import { AuditLog } from '@/domain/entities/AuditLog';
import { Employee } from '@/domain/entities/Employee';
import { TimeEntry } from '@/domain/entities/TimeEntry';
import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import type {
  AuditLogPaginatedResult,
  FindAuditLogsFilter,
  FindAuditLogsPagination,
  IAuditLogRepository,
} from '@/domain/repositories/IAuditLogRepository';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type {
  IEmployeeRepository,
  FindEmployeesFilter,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';
import type { ITimeEntryRepository } from '@/domain/repositories/ITimeEntryRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';
import type { Role } from '@/domain/value-objects/Role';

import { TransferEmployeeUseCase } from '../use-cases/employee/TransferEmployeeUseCase';

// ── Fakes ──────────────────────────────────────────────────────────────────

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

class FakeEmployeeRepository implements IEmployeeRepository {
  readonly store = new Map<string, Employee>();
  async findById(id: string): Promise<Employee | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmail(_email: string): Promise<Employee | null> { return null; }
  async findAll(
    _filter?: FindEmployeesFilter,
    _pagination?: PaginationOptions,
  ): Promise<PaginatedResult<Employee>> {
    const items = [...this.store.values()];
    return {
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
      totalPages: 1,
    };
  }
  async save(employee: Employee): Promise<void> {
    this.store.set(employee.id, employee);
  }
  async update(employee: Employee): Promise<void> {
    this.store.set(employee.id, employee);
  }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsByEmail(_email: string): Promise<boolean> { return false; }
}

class FakeAreaRepository implements IAreaRepository {
  readonly store = new Map<string, Area>();
  async findById(id: string): Promise<Area | null> {
    return this.store.get(id) ?? null;
  }
  async findByName(_name: string): Promise<Area | null> { return null; }
  async findAll(): Promise<Area[]> { return [...this.store.values()]; }
  async save(area: Area): Promise<void> { this.store.set(area.id, area); }
  async update(area: Area): Promise<void> { this.store.set(area.id, area); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsById(id: string): Promise<boolean> { return this.store.has(id); }
}

class FakeVacationRepository implements IVacationRepository {
  readonly store = new Map<string, Vacation>();
  async save(v: Vacation): Promise<void> { this.store.set(v.id, v); }
  async findById(id: string): Promise<Vacation | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmployeeOverlapping(
    employeeId: string,
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
  ): Promise<Vacation[]> {
    return [...this.store.values()].filter((v) => {
      if (v.employeeId !== employeeId) return false;
      if (statuses && statuses.length > 0 && !statuses.includes(v.status)) return false;
      if (v.startDate.getTime() > to.getTime()) return false;
      if (v.endDate.getTime() < from.getTime()) return false;
      return true;
    });
  }
  async findOverlapping(
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
    _areaId?: string,
  ): Promise<Vacation[]> {
    return [...this.store.values()].filter((v) => {
      if (statuses && statuses.length > 0 && !statuses.includes(v.status)) return false;
      if (v.startDate.getTime() > to.getTime()) return false;
      if (v.endDate.getTime() < from.getTime()) return false;
      return true;
    });
  }
}

class FakeTimeEntryRepository implements ITimeEntryRepository {
  readonly store = new Map<string, TimeEntry>();
  async save(entry: TimeEntry): Promise<void> { this.store.set(entry.id, entry); }
  async findByEmployeeAndDate(
    employeeId: string,
    date: Date,
  ): Promise<TimeEntry | null> {
    const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    for (const e of this.store.values()) {
      if (e.employeeId === employeeId && e.date.getTime() === day) return e;
    }
    return null;
  }
  async findByEmployeeInRange(
    employeeId: string,
    from: Date,
    to: Date,
  ): Promise<TimeEntry[]> {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    return [...this.store.values()]
      .filter((e) => e.employeeId === employeeId)
      .filter((e) => e.date.getTime() >= fromMs && e.date.getTime() <= toMs)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}

// ── Shared fakes injected into the container mock ──────────────────────────

const fakeAuditRepo = new FakeAuditLogRepository();
const fakeEmployeeRepo = new FakeEmployeeRepository();
const fakeAreaRepo = new FakeAreaRepository();
const fakeVacationRepo = new FakeVacationRepository();
const fakeTimeEntryRepo = new FakeTimeEntryRepository();

jest.mock('@/infrastructure/container/container', () => {
  const {
    LogAuditEntryUseCase: LogUC,
  } = jest.requireActual('../use-cases/audit/LogAuditEntryUseCase');
  const {
    TransferEmployeeUseCase: TransferUC,
  } = jest.requireActual('../use-cases/employee/TransferEmployeeUseCase');

  return {
    container: {
      logAuditEntry: new LogUC(fakeAuditRepo),
      transferEmployee: new TransferUC(
        fakeEmployeeRepo,
        fakeAreaRepo,
        fakeVacationRepo,
        fakeTimeEntryRepo,
      ),
    },
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────

const AREA_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AREA_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EMP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000ac';
const EFFECTIVE_DATE = '2025-06-01T00:00:00.000Z';

function makeArea(id: string, name: string): Area {
  const now = new Date('2024-01-01T00:00:00Z');
  return Area.create({
    id,
    name,
    description: null,
    managerId: null,
    createdAt: now,
    updatedAt: now,
  });
}

function makeEmployee(overrides: Partial<{
  id: string;
  areaId: string | null;
  status: EmployeeStatus;
}> = {}): Employee {
  const now = new Date('2024-01-01T00:00:00Z');
  return Employee.create({
    id: overrides.id ?? EMP_ID,
    firstName: 'Alex',
    lastName: 'Tester',
    email: Email.create('alex@example.com'),
    phone: null,
    position: 'engineer',
    salary: Money.create(1000, 'EUR'),
    status: overrides.status ?? EmployeeStatus.ACTIVE,
    hireDate: new Date('2024-01-01T00:00:00Z'),
    areaId: overrides.areaId === undefined ? AREA_A : overrides.areaId,
    role: 'employee',
    createdAt: now,
    updatedAt: now,
  });
}

function makeTimeEntry(id: string, dateIso: string): TimeEntry {
  const now = new Date('2024-01-01T00:00:00Z');
  return TimeEntry.create({
    id,
    employeeId: EMP_ID,
    date: new Date(dateIso),
    hours: 8,
    notes: null,
    createdAt: now,
    updatedAt: now,
  });
}

function makeVacation(overrides: Partial<{
  id: string;
  startDate: string;
  endDate: string;
  status: VacationStatus;
}> = {}): Vacation {
  return Vacation.create({
    id: overrides.id ?? 'vac-1',
    employeeId: EMP_ID,
    startDate: new Date(overrides.startDate ?? '2025-05-25T00:00:00Z'),
    endDate: new Date(overrides.endDate ?? '2025-06-10T00:00:00Z'),
    ...(overrides.status !== undefined ? { status: overrides.status } : {}),
  });
}

interface FakeRequestOpts {
  role?: Role | string | null;
  body?: unknown;
  headers?: Record<string, string>;
}

function makeRequest(opts: FakeRequestOpts = {}): any {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.role !== null && opts.role !== undefined) {
    headers['x-role'] = String(opts.role);
  }
  const bodyText = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return {
    text: async () => bodyText,
    json: async () => opts.body ?? {},
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
  };
}

function ctx(id: string = EMP_ID): { params: { id: string } } {
  return { params: { id } };
}

function baseBody(overrides: Partial<{
  new_area_id: string;
  effective_date: string | undefined;
}> = {}): any {
  return {
    new_area_id: overrides.new_area_id ?? AREA_B,
    ...(overrides.effective_date !== undefined
      ? { effective_date: overrides.effective_date }
      : { effective_date: EFFECTIVE_DATE }),
  };
}

function resetState(): void {
  fakeAuditRepo.store.length = 0;
  fakeEmployeeRepo.store.clear();
  fakeAreaRepo.store.clear();
  fakeVacationRepo.store.clear();
  fakeTimeEntryRepo.store.clear();
}

async function seedHappyPath(): Promise<void> {
  await fakeAreaRepo.save(makeArea(AREA_A, 'Engineering'));
  await fakeAreaRepo.save(makeArea(AREA_B, 'Platform'));
  await fakeEmployeeRepo.save(makeEmployee({ areaId: AREA_A }));
}

// ─────────────────────────────────────────────────────────────────────────
// AC-1 · POST /api/employees/:id/transfer exists and is admin-only
// ─────────────────────────────────────────────────────────────────────────

describe('AC-1 · POST /api/employees/:id/transfer is admin-only', () => {
  beforeEach(() => resetState());

  it('exposes a POST handler', async () => {
    const mod = await import('@/app/api/employees/[id]/transfer/route');
    expect(typeof mod.POST).toBe('function');
  });

  it.each<[Role | null, number]>([
    ['admin', 200],
    ['manager', 403],
    ['employee', 403],
    [null, 403],
  ])('role=%s → status %s', async (role, expected) => {
    resetState();
    await seedHappyPath();
    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role,
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody(),
      }),
      ctx(),
    );
    expect(res.status).toBe(expected);
  });

  it('403 body matches AC-11 shape (T10) when caller is employee', async () => {
    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'employee',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody(),
      }),
      ctx(),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: 'forbidden',
      required_roles: ['admin'],
      your_role: 'employee',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-2 · Body { new_area_id, effective_date? }, default effective_date=now
// ─────────────────────────────────────────────────────────────────────────

describe('AC-2 · body schema and effective_date defaulting', () => {
  beforeEach(() => resetState());

  it('rejects missing body with 400', async () => {
    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({ role: 'admin', headers: { 'x-actor-id': ACTOR_ID } }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it('rejects unknown top-level fields with 400', async () => {
    await seedHappyPath();
    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: { ...baseBody(), extra: 'x' },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing new_area_id with 400', async () => {
    await seedHappyPath();
    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: { effective_date: EFFECTIVE_DATE },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it('accepts a valid body without effective_date — defaults to now', async () => {
    await seedHappyPath();
    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const beforeMs = Date.now();
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: { new_area_id: AREA_B },
      }),
      ctx(),
    );
    const afterMs = Date.now();
    expect(res.status).toBe(200);
    const body = await res.json();
    const effectiveMs = new Date(body.effective_date).getTime();
    // The server-side default is created right when the handler runs.
    expect(effectiveMs).toBeGreaterThanOrEqual(beforeMs);
    expect(effectiveMs).toBeLessThanOrEqual(afterMs);
  });

  it('uses the provided effective_date verbatim when supplied', async () => {
    await seedHappyPath();
    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody(),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.effective_date).toBe(EFFECTIVE_DATE);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-3 · 200 response shape
// ─────────────────────────────────────────────────────────────────────────

describe('AC-3 · 200 response shape', () => {
  beforeEach(() => resetState());

  it('returns employee + transfer metadata + affected arrays', async () => {
    await seedHappyPath();
    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody(),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      transferred_from: AREA_A,
      transferred_to: AREA_B,
      effective_date: EFFECTIVE_DATE,
      affected_vacations: [],
      affected_time_entries: [],
    });
    expect(body.employee).toMatchObject({ id: EMP_ID, areaId: AREA_B });
    expect(typeof body.transferred_at).toBe('string');
    expect(Number.isNaN(new Date(body.transferred_at).getTime())).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-4 · new_area_id == current → 422 SAME_AREA
// ─────────────────────────────────────────────────────────────────────────

describe('AC-4 · same area → 422 SAME_AREA', () => {
  beforeEach(() => resetState());

  it('returns 422 with code SAME_AREA and does not mutate the employee', async () => {
    await seedHappyPath();
    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody({ new_area_id: AREA_A }),
      }),
      ctx(),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('SAME_AREA');
    // employee.areaId unchanged
    expect(fakeEmployeeRepo.store.get(EMP_ID)?.areaId).toBe(AREA_A);
    // no audit row written
    expect(fakeAuditRepo.store).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-5 · unknown new_area_id → 404 AREA_NOT_FOUND
// ─────────────────────────────────────────────────────────────────────────

describe('AC-5 · unknown new_area_id → 404 AREA_NOT_FOUND', () => {
  beforeEach(() => resetState());

  it('returns 404 with code AREA_NOT_FOUND when target area is missing', async () => {
    await fakeAreaRepo.save(makeArea(AREA_A, 'Engineering'));
    await fakeEmployeeRepo.save(makeEmployee({ areaId: AREA_A }));

    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody({ new_area_id: 'unknown-area-id' }),
      }),
      ctx(),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('AREA_NOT_FOUND');
    expect(fakeEmployeeRepo.store.get(EMP_ID)?.areaId).toBe(AREA_A);
    expect(fakeAuditRepo.store).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-6 · offboarded employee → 422 EMPLOYEE_OFFBOARDED
// ─────────────────────────────────────────────────────────────────────────

describe('AC-6 · offboarded employee → 422 EMPLOYEE_OFFBOARDED', () => {
  beforeEach(() => resetState());

  it('returns 422 with code EMPLOYEE_OFFBOARDED for an INACTIVE employee', async () => {
    await fakeAreaRepo.save(makeArea(AREA_A, 'Engineering'));
    await fakeAreaRepo.save(makeArea(AREA_B, 'Platform'));
    await fakeEmployeeRepo.save(
      makeEmployee({ areaId: AREA_A, status: EmployeeStatus.INACTIVE }),
    );

    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody(),
      }),
      ctx(),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('EMPLOYEE_OFFBOARDED');
    // employee.areaId unchanged
    expect(fakeEmployeeRepo.store.get(EMP_ID)?.areaId).toBe(AREA_A);
    expect(fakeAuditRepo.store).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-7 · TimeEntries partitioned around effective_date
// ─────────────────────────────────────────────────────────────────────────

describe('AC-7 · TimeEntries before effective_date keep old area; after → new', () => {
  beforeEach(() => resetState());

  it('past entries are not mutated; on-or-after entries land in affected_time_entries', async () => {
    await seedHappyPath();

    const pastEntry = makeTimeEntry('te-past', '2025-01-15T00:00:00Z');
    const onEffectiveEntry = makeTimeEntry('te-on', '2025-06-01T00:00:00Z');
    const futureEntry = makeTimeEntry('te-future', '2025-09-01T00:00:00Z');
    await fakeTimeEntryRepo.save(pastEntry);
    await fakeTimeEntryRepo.save(onEffectiveEntry);
    await fakeTimeEntryRepo.save(futureEntry);

    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody(),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const ids = (body.affected_time_entries as { id: string }[]).map((e) => e.id);
    expect(ids.sort()).toEqual(['te-future', 'te-on']);
    // past entry is NOT reported
    expect(ids).not.toContain('te-past');

    // The repo store was not touched — past entry still exists, not modified.
    expect(fakeTimeEntryRepo.store.has('te-past')).toBe(true);
    expect(fakeTimeEntryRepo.store.has('te-on')).toBe(true);
    expect(fakeTimeEntryRepo.store.has('te-future')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-8 · Vacations: PENDING stay PENDING; APPROVED crossing → reported
// ─────────────────────────────────────────────────────────────────────────

describe('AC-8 · Vacations PENDING untouched; APPROVED crossing reported only', () => {
  beforeEach(() => resetState());

  it('PENDING remains PENDING and is NOT in affected_vacations', async () => {
    await seedHappyPath();
    const pending = makeVacation({
      id: 'vac-pending',
      startDate: '2025-05-20T00:00:00Z',
      endDate: '2025-06-05T00:00:00Z',
      status: 'PENDING',
    });
    await fakeVacationRepo.save(pending);

    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody(),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.affected_vacations).toEqual([]);
    // Status unchanged.
    expect(fakeVacationRepo.store.get('vac-pending')?.status).toBe('PENDING');
  });

  it('APPROVED crossing effective_date is in affected_vacations and not mutated', async () => {
    await seedHappyPath();
    const approvedCrossing = makeVacation({
      id: 'vac-approved-cross',
      startDate: '2025-05-25T00:00:00Z',
      endDate: '2025-06-10T00:00:00Z',
      status: 'APPROVED',
    });
    const approvedEarlier = makeVacation({
      id: 'vac-approved-earlier',
      startDate: '2025-01-01T00:00:00Z',
      endDate: '2025-01-10T00:00:00Z',
      status: 'APPROVED',
    });
    await fakeVacationRepo.save(approvedCrossing);
    await fakeVacationRepo.save(approvedEarlier);

    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody(),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const reportedIds = (body.affected_vacations as { id: string }[]).map((v) => v.id);
    expect(reportedIds).toEqual(['vac-approved-cross']);
    // Both vacations remain APPROVED, untouched.
    expect(fakeVacationRepo.store.get('vac-approved-cross')?.status).toBe('APPROVED');
    expect(fakeVacationRepo.store.get('vac-approved-earlier')?.status).toBe('APPROVED');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-9 · Audit log entry employee.transferred
// ─────────────────────────────────────────────────────────────────────────

describe('AC-9 · audit log: employee.transferred with detailsJson', () => {
  beforeEach(() => resetState());

  it('writes exactly one audit row with the documented detailsJson shape', async () => {
    await seedHappyPath();

    // Mix one time entry on/after and one APPROVED vacation crossing so the
    // counts in detailsJson are non-zero.
    await fakeTimeEntryRepo.save(makeTimeEntry('te-after', '2025-09-01T00:00:00Z'));
    await fakeVacationRepo.save(makeVacation({
      id: 'vac-cross',
      startDate: '2025-05-25T00:00:00Z',
      endDate: '2025-06-10T00:00:00Z',
      status: 'APPROVED',
    }));

    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    const res = await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody(),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);

    expect(fakeAuditRepo.store).toHaveLength(1);
    const entry = fakeAuditRepo.store[0]!;
    expect(entry.actorId).toBe(ACTOR_ID);
    expect(entry.action).toBe('employee.transferred');
    expect(entry.resourceType).toBe('employee');
    expect(entry.resourceId).toBe(EMP_ID);
    expect(entry.detailsJson).toEqual({
      from_area_id: AREA_A,
      to_area_id: AREA_B,
      effective_date: EFFECTIVE_DATE,
      affected_vacations_count: 1,
      affected_time_entries_count: 1,
    });
  });

  it('does NOT write an audit row when the use case rejects (SAME_AREA)', async () => {
    await seedHappyPath();
    const { POST } = await import('@/app/api/employees/[id]/transfer/route');
    await POST(
      makeRequest({
        role: 'admin',
        headers: { 'x-actor-id': ACTOR_ID },
        body: baseBody({ new_area_id: AREA_A }),
      }),
      ctx(),
    );
    expect(fakeAuditRepo.store).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Unit coverage — direct use-case calls (validates ordering of guards)
// ─────────────────────────────────────────────────────────────────────────

describe('TransferEmployeeUseCase — direct invocation', () => {
  beforeEach(() => resetState());

  it('throws DomainNotFoundError when employee does not exist', async () => {
    const uc = new TransferEmployeeUseCase(
      fakeEmployeeRepo,
      fakeAreaRepo,
      fakeVacationRepo,
      fakeTimeEntryRepo,
    );
    await expect(
      uc.execute({
        employeeId: 'no-such-emp',
        newAreaId: AREA_B,
        effectiveDate: new Date(EFFECTIVE_DATE),
      }),
    ).rejects.toMatchObject({ name: 'DomainNotFoundError', resourceType: 'Employee' });
  });

  it('rejects offboarded BEFORE checking the target area', async () => {
    await fakeAreaRepo.save(makeArea(AREA_A, 'Engineering'));
    // target area intentionally MISSING — offboarded must still take precedence
    await fakeEmployeeRepo.save(
      makeEmployee({ areaId: AREA_A, status: EmployeeStatus.INACTIVE }),
    );
    const uc = new TransferEmployeeUseCase(
      fakeEmployeeRepo,
      fakeAreaRepo,
      fakeVacationRepo,
      fakeTimeEntryRepo,
    );
    await expect(
      uc.execute({
        employeeId: EMP_ID,
        newAreaId: 'missing-area',
        effectiveDate: new Date(EFFECTIVE_DATE),
      }),
    ).rejects.toMatchObject({ name: 'EmployeeOffboardedError' });
  });
});
