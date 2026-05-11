/**
 * T14 — TimeEntry approval workflow
 *
 *   AC-1 · TimeEntry adds `status: PENDING|APPROVED|REJECTED`, default PENDING
 *   AC-2 · POST /api/time-entries/:id/approve — manager-gated, PENDING→APPROVED
 *   AC-3 · POST /api/time-entries/:id/reject — manager-gated, PENDING→REJECTED
 *          + REQUIRED reason
 *   AC-4 · Approve/reject on non-PENDING → 422 INVALID_STATE_TRANSITION
 *   AC-5 · GET /api/time-entries supports ?status=... filter (default: all)
 *   AC-6 · Reports (HoursByArea + GetEmployeeMonthly) only count APPROVED
 *   AC-7 · Audit log records 'time-entry.approved' / 'time-entry.rejected'
 *   AC-8 · Employee role CANNOT approve/reject (role-gate excludes 'employee')
 */

import { Area } from '@/domain/entities/Area';
import { Employee } from '@/domain/entities/Employee';
import {
  TIME_ENTRY_STATUSES,
  TimeEntry,
  type TimeEntryStatus,
} from '@/domain/entities/TimeEntry';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import { TimeEntryNotPendingError } from '@/domain/errors/TimeEntryNotPendingError';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';
import type { Role } from '@/domain/value-objects/Role';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type {
  FindEmployeesFilter,
  IEmployeeRepository,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';
import type {
  FindTimeEntriesFilter,
  ITimeEntryRepository,
} from '@/domain/repositories/ITimeEntryRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';
import type { Vacation, VacationStatus } from '@/domain/entities/Vacation';

import { ApproveTimeEntryUseCase } from '../use-cases/time-entry/ApproveTimeEntryUseCase';
import { ListTimeEntriesUseCase } from '../use-cases/time-entry/ListTimeEntriesUseCase';
import { RejectTimeEntryUseCase } from '../use-cases/time-entry/RejectTimeEntryUseCase';
import { HoursByAreaReportUseCase } from '../use-cases/report/HoursByAreaReportUseCase';
import { GetEmployeeMonthlyReportUseCase } from '../use-cases/report/GetEmployeeMonthlyReportUseCase';

// ── In-memory fakes ─────────────────────────────────────────────────────────

class FakeTimeEntryRepository implements ITimeEntryRepository {
  readonly store: Map<string, TimeEntry> = new Map();

  async save(entry: TimeEntry): Promise<void> {
    this.store.set(entry.id, entry);
  }
  async findByEmployeeAndDate(employeeId: string, date: Date): Promise<TimeEntry | null> {
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
  async findById(id: string): Promise<TimeEntry | null> {
    return this.store.get(id) ?? null;
  }
  async findAll(filter: FindTimeEntriesFilter = {}): Promise<TimeEntry[]> {
    return [...this.store.values()].filter((e) => {
      if (filter.status !== undefined && e.status !== filter.status) return false;
      if (filter.employeeId !== undefined && e.employeeId !== filter.employeeId) return false;
      return true;
    });
  }
}

class FakeAreaRepository implements IAreaRepository {
  readonly store: Map<string, Area> = new Map();
  async findById(id: string): Promise<Area | null> { return this.store.get(id) ?? null; }
  async findByName(name: string): Promise<Area | null> {
    for (const a of this.store.values()) if (a.name === name) return a;
    return null;
  }
  async findAll(): Promise<Area[]> { return [...this.store.values()]; }
  async save(area: Area): Promise<void> { this.store.set(area.id, area); }
  async update(area: Area): Promise<void> { this.store.set(area.id, area); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsById(id: string): Promise<boolean> { return this.store.has(id); }
}

class FakeEmployeeRepository implements IEmployeeRepository {
  readonly store: Map<string, Employee> = new Map();
  async findById(id: string): Promise<Employee | null> { return this.store.get(id) ?? null; }
  async findByEmail(email: string): Promise<Employee | null> {
    for (const e of this.store.values()) if (e.email.value === email) return e;
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
  async save(employee: Employee): Promise<void> { this.store.set(employee.id, employee); }
  async update(employee: Employee): Promise<void> { this.store.set(employee.id, employee); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsByEmail(email: string): Promise<boolean> {
    return (await this.findByEmail(email)) !== null;
  }
}

class FakeVacationRepository implements IVacationRepository {
  readonly store: Map<string, Vacation> = new Map();
  async save(v: Vacation): Promise<void> { this.store.set(v.id, v); }
  async findById(id: string): Promise<Vacation | null> { return this.store.get(id) ?? null; }
  async findByEmployeeOverlapping(
    employeeId: string,
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
  ): Promise<Vacation[]> {
    return [...this.store.values()]
      .filter((v) => v.employeeId === employeeId)
      .filter((v) => v.startDate.getTime() <= to.getTime() && v.endDate.getTime() >= from.getTime())
      .filter((v) => !statuses || statuses.includes(v.status));
  }
  async findOverlapping(
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
  ): Promise<Vacation[]> {
    return [...this.store.values()]
      .filter((v) => v.startDate.getTime() <= to.getTime() && v.endDate.getTime() >= from.getTime())
      .filter((v) => !statuses || statuses.includes(v.status));
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-15T00:00:00.000Z');

function makeArea(id: string, name: string): Area {
  return Area.create({
    id, name, description: null, managerId: null, createdAt: NOW, updatedAt: NOW,
  });
}

function makeEmployee(id: string, areaId: string | null = null): Employee {
  return Employee.create({
    id,
    firstName: 'Ana',
    lastName: 'García',
    email: Email.create(`${id}@workhub.com`),
    phone: null,
    position: 'Engineer',
    salary: Money.create(1, 'EUR'),
    status: EmployeeStatus.ACTIVE,
    hireDate: NOW,
    areaId,
    role: 'employee',
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function makeEntry(
  id: string,
  employeeId: string,
  isoDate: string,
  hours: number,
  status?: TimeEntryStatus,
): TimeEntry {
  return TimeEntry.create({
    id,
    employeeId,
    date: new Date(`${isoDate}T00:00:00Z`),
    hours,
    notes: null,
    ...(status !== undefined ? { status } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

// ── Mock container for route-level tests ────────────────────────────────────

const ucMocks = {
  approveTimeEntry: jest.fn<Promise<unknown>, [unknown]>(),
  rejectTimeEntry: jest.fn<Promise<unknown>, [unknown]>(),
  listTimeEntries: jest.fn<Promise<unknown>, [unknown]>(),
  registerTimeEntry: jest.fn<Promise<unknown>, [unknown]>(),
  logAuditEntry: jest.fn(async (_dto: unknown) => undefined),
};

jest.mock('@/infrastructure/container/container', () => ({
  container: {
    get approveTimeEntry() { return { execute: ucMocks.approveTimeEntry }; },
    get rejectTimeEntry() { return { execute: ucMocks.rejectTimeEntry }; },
    get listTimeEntries() { return { execute: ucMocks.listTimeEntries }; },
    get registerTimeEntry() { return { execute: ucMocks.registerTimeEntry }; },
    get logAuditEntry() { return { execute: ucMocks.logAuditEntry }; },
  },
}));

beforeEach(() => {
  for (const fn of Object.values(ucMocks)) fn.mockReset();
  ucMocks.logAuditEntry.mockImplementation(async () => undefined);
});

function FakeRequestContext(opts: {
  role?: Role | string | null;
  body?: unknown;
  query?: Record<string, string>;
  actorId?: string;
} = {}): any {
  const headers: Record<string, string> = {};
  if (opts.role !== null && opts.role !== undefined) headers['x-role'] = String(opts.role);
  if (opts.actorId !== undefined) headers['x-actor-id'] = opts.actorId;
  const bodyText = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return {
    json: async () => opts.body ?? {},
    text: async () => bodyText,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    nextUrl: { searchParams: new URLSearchParams(opts.query ?? {}) },
  };
}

// ============================================================================
// AC-1 · TimeEntry adds status, default PENDING
// ============================================================================

describe('AC-1 · TimeEntry status field', () => {
  it('exposes the canonical status union', () => {
    expect([...TIME_ENTRY_STATUSES]).toEqual(['PENDING', 'APPROVED', 'REJECTED']);
  });

  it('TimeEntry.create defaults status to PENDING when caller omits it', () => {
    const e = makeEntry('te-1', 'emp-1', '2026-04-01', 8);
    expect(e.status).toBe('PENDING');
    expect(e.approvedAt).toBeNull();
    expect(e.approvedBy).toBeNull();
    expect(e.rejectedAt).toBeNull();
    expect(e.rejectedBy).toBeNull();
    expect(e.rejectionReason).toBeNull();
  });

  it('TimeEntry.create accepts explicit status', () => {
    const e = makeEntry('te-1', 'emp-1', '2026-04-01', 8, 'APPROVED');
    expect(e.status).toBe('APPROVED');
  });

  it('TimeEntry.create rejects unknown status with DomainValidationError', () => {
    expect(() =>
      TimeEntry.create({
        id: 'te-1',
        employeeId: 'emp-1',
        date: new Date('2026-04-01T00:00:00Z'),
        hours: 8,
        notes: null,
        status: 'WHATEVER' as unknown as TimeEntryStatus,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).toThrow(DomainValidationError);
  });
});

// ============================================================================
// AC-2 · POST /api/time-entries/:id/approve — transitions PENDING → APPROVED
// ============================================================================

describe('AC-2 · ApproveTimeEntryUseCase transitions PENDING → APPROVED', () => {
  it('sets status, approvedAt, approvedBy and persists', async () => {
    const repo = new FakeTimeEntryRepository();
    await repo.save(makeEntry('te-1', 'emp-1', '2026-04-01', 8));

    const before = Date.now();
    const result = await new ApproveTimeEntryUseCase(repo).execute({
      timeEntryId: 'te-1',
      approverId: 'manager-99',
    });
    const after = Date.now();

    expect(result.status).toBe('APPROVED');
    expect(result.approved_by).toBe('manager-99');
    expect(result.approved_at).not.toBeNull();
    const ts = new Date(result.approved_at!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);

    const persisted = await repo.findById('te-1');
    expect(persisted!.status).toBe('APPROVED');
    expect(persisted!.approvedBy).toBe('manager-99');
  });

  it('throws DomainNotFoundError when the entry does not exist', async () => {
    const repo = new FakeTimeEntryRepository();
    await expect(
      new ApproveTimeEntryUseCase(repo).execute({
        timeEntryId: 'missing', approverId: 'manager-1',
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  it('persists null approverId when actor header is absent', async () => {
    const repo = new FakeTimeEntryRepository();
    await repo.save(makeEntry('te-1', 'emp-1', '2026-04-01', 8));

    const result = await new ApproveTimeEntryUseCase(repo).execute({
      timeEntryId: 'te-1', approverId: null,
    });
    expect(result.approved_by).toBeNull();
  });

  it('route POST returns 200 with the approved entry (admin/manager allowed)', async () => {
    ucMocks.approveTimeEntry.mockResolvedValueOnce({
      id: 'te-1', status: 'APPROVED', approved_at: '2026-04-15T00:00:00.000Z', approved_by: 'mgr',
    });
    const { POST } = await import('@/app/api/time-entries/[id]/approve/route');
    const res = await POST(
      FakeRequestContext({ role: 'manager', actorId: 'mgr' }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(200);
    const body = await res.clone().json();
    expect(body.status).toBe('APPROVED');
    expect(ucMocks.approveTimeEntry).toHaveBeenCalledWith({
      timeEntryId: 'te-1',
      approverId: 'mgr',
    });
  });
});

// ============================================================================
// AC-3 · POST /api/time-entries/:id/reject — REQUIRED reason
// ============================================================================

describe('AC-3 · RejectTimeEntryUseCase transitions PENDING → REJECTED with reason', () => {
  it('sets status, rejectedAt, rejectedBy, rejectionReason', async () => {
    const repo = new FakeTimeEntryRepository();
    await repo.save(makeEntry('te-1', 'emp-1', '2026-04-01', 8));

    const result = await new RejectTimeEntryUseCase(repo).execute({
      timeEntryId: 'te-1',
      rejecterId: 'manager-99',
      reason: 'Hours look inflated',
    });

    expect(result.status).toBe('REJECTED');
    expect(result.rejected_by).toBe('manager-99');
    expect(result.rejected_at).not.toBeNull();
    expect(result.rejection_reason).toBe('Hours look inflated');

    const persisted = await repo.findById('te-1');
    expect(persisted!.status).toBe('REJECTED');
    expect(persisted!.rejectionReason).toBe('Hours look inflated');
  });

  it('throws DomainValidationError when reason is empty', async () => {
    const repo = new FakeTimeEntryRepository();
    await repo.save(makeEntry('te-1', 'emp-1', '2026-04-01', 8));

    await expect(
      new RejectTimeEntryUseCase(repo).execute({
        timeEntryId: 'te-1', rejecterId: 'm', reason: '',
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('throws DomainValidationError when reason is whitespace-only', async () => {
    const repo = new FakeTimeEntryRepository();
    await repo.save(makeEntry('te-1', 'emp-1', '2026-04-01', 8));

    await expect(
      new RejectTimeEntryUseCase(repo).execute({
        timeEntryId: 'te-1', rejecterId: 'm', reason: '   ',
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('throws DomainNotFoundError when the entry does not exist', async () => {
    const repo = new FakeTimeEntryRepository();
    await expect(
      new RejectTimeEntryUseCase(repo).execute({
        timeEntryId: 'missing', rejecterId: 'm', reason: 'no',
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  it('route returns 400 when body is missing reason', async () => {
    const { POST } = await import('@/app/api/time-entries/[id]/reject/route');
    const res = await POST(
      FakeRequestContext({ role: 'manager', body: {} }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(400);
    expect(ucMocks.rejectTimeEntry).not.toHaveBeenCalled();
  });

  it('route returns 400 when body is empty / not JSON', async () => {
    const { POST } = await import('@/app/api/time-entries/[id]/reject/route');
    // body undefined → FakeRequestContext.text() returns ''
    const res = await POST(
      FakeRequestContext({ role: 'manager' }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(400);
  });

  it('route returns 200 + invokes use case when reason is present', async () => {
    ucMocks.rejectTimeEntry.mockResolvedValueOnce({
      id: 'te-1', status: 'REJECTED',
      rejected_at: '2026-04-15T00:00:00.000Z',
      rejected_by: 'mgr',
      rejection_reason: 'inflated',
    });
    const { POST } = await import('@/app/api/time-entries/[id]/reject/route');
    const res = await POST(
      FakeRequestContext({ role: 'admin', actorId: 'mgr', body: { reason: 'inflated' } }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(200);
    expect(ucMocks.rejectTimeEntry).toHaveBeenCalledWith({
      timeEntryId: 'te-1',
      rejecterId: 'mgr',
      reason: 'inflated',
    });
  });
});

// ============================================================================
// AC-4 · approve/reject non-PENDING → 422 INVALID_STATE_TRANSITION
// ============================================================================

describe('AC-4 · invalid state transitions raise TimeEntryNotPendingError → 422', () => {
  it('approve on already-APPROVED throws TimeEntryNotPendingError', async () => {
    const repo = new FakeTimeEntryRepository();
    await repo.save(makeEntry('te-1', 'emp-1', '2026-04-01', 8, 'APPROVED'));

    try {
      await new ApproveTimeEntryUseCase(repo).execute({
        timeEntryId: 'te-1', approverId: 'm',
      });
      fail('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TimeEntryNotPendingError);
      expect((err as TimeEntryNotPendingError).currentStatus).toBe('APPROVED');
    }
  });

  it('approve on already-REJECTED throws TimeEntryNotPendingError', async () => {
    const repo = new FakeTimeEntryRepository();
    const entry = makeEntry('te-1', 'emp-1', '2026-04-01', 8);
    entry.reject('m', 'no', new Date());
    await repo.save(entry);

    await expect(
      new ApproveTimeEntryUseCase(repo).execute({ timeEntryId: 'te-1', approverId: 'm' }),
    ).rejects.toBeInstanceOf(TimeEntryNotPendingError);
  });

  it('reject on already-APPROVED throws TimeEntryNotPendingError', async () => {
    const repo = new FakeTimeEntryRepository();
    const entry = makeEntry('te-1', 'emp-1', '2026-04-01', 8);
    entry.approve('m', new Date());
    await repo.save(entry);

    await expect(
      new RejectTimeEntryUseCase(repo).execute({
        timeEntryId: 'te-1', rejecterId: 'm', reason: 'reverse',
      }),
    ).rejects.toBeInstanceOf(TimeEntryNotPendingError);
  });

  it('approve route maps TimeEntryNotPendingError → 422 with INVALID_STATE_TRANSITION body', async () => {
    ucMocks.approveTimeEntry.mockRejectedValueOnce(new TimeEntryNotPendingError('APPROVED'));
    const { POST } = await import('@/app/api/time-entries/[id]/approve/route');
    const res = await POST(
      FakeRequestContext({ role: 'manager' }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'invalid_state_transition',
      code: 'INVALID_STATE_TRANSITION',
      current_status: 'APPROVED',
    });
  });

  it('reject route maps TimeEntryNotPendingError → 422 with INVALID_STATE_TRANSITION body', async () => {
    ucMocks.rejectTimeEntry.mockRejectedValueOnce(new TimeEntryNotPendingError('REJECTED'));
    const { POST } = await import('@/app/api/time-entries/[id]/reject/route');
    const res = await POST(
      FakeRequestContext({ role: 'manager', body: { reason: 'wrong day' } }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'invalid_state_transition',
      code: 'INVALID_STATE_TRANSITION',
      current_status: 'REJECTED',
    });
  });
});

// ============================================================================
// AC-5 · GET /api/time-entries supports ?status=... filter (default: all)
// ============================================================================

describe('AC-5 · ListTimeEntriesUseCase + GET /api/time-entries ?status filter', () => {
  it('returns every entry when no filter is given', async () => {
    const repo = new FakeTimeEntryRepository();
    await repo.save(makeEntry('te-1', 'emp-1', '2026-04-01', 8));
    await repo.save(makeEntry('te-2', 'emp-1', '2026-04-02', 8, 'APPROVED'));
    await repo.save(makeEntry('te-3', 'emp-1', '2026-04-03', 8, 'REJECTED'));

    const result = await new ListTimeEntriesUseCase(repo).execute();
    expect(result.entries.map((e) => e.id).sort()).toEqual(['te-1', 'te-2', 'te-3']);
  });

  it('filters by status=PENDING', async () => {
    const repo = new FakeTimeEntryRepository();
    await repo.save(makeEntry('te-1', 'emp-1', '2026-04-01', 8));
    await repo.save(makeEntry('te-2', 'emp-1', '2026-04-02', 8, 'APPROVED'));
    await repo.save(makeEntry('te-3', 'emp-1', '2026-04-03', 8, 'REJECTED'));

    const result = await new ListTimeEntriesUseCase(repo).execute({ status: 'PENDING' });
    expect(result.entries.map((e) => e.id)).toEqual(['te-1']);
  });

  it('filters by status=APPROVED', async () => {
    const repo = new FakeTimeEntryRepository();
    await repo.save(makeEntry('te-1', 'emp-1', '2026-04-01', 8));
    await repo.save(makeEntry('te-2', 'emp-1', '2026-04-02', 8, 'APPROVED'));

    const result = await new ListTimeEntriesUseCase(repo).execute({ status: 'APPROVED' });
    expect(result.entries.map((e) => e.id)).toEqual(['te-2']);
  });

  it('rejects unknown status with DomainValidationError', async () => {
    const repo = new FakeTimeEntryRepository();
    await expect(
      new ListTimeEntriesUseCase(repo).execute({
        status: 'WHATEVER' as unknown as TimeEntryStatus,
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('route GET forwards ?status query parameter to the use case', async () => {
    ucMocks.listTimeEntries.mockResolvedValueOnce({ entries: [] });
    const { GET } = await import('@/app/api/time-entries/route');
    const res = await GET(FakeRequestContext({ query: { status: 'PENDING' } }));
    expect(res.status).toBe(200);
    expect(ucMocks.listTimeEntries).toHaveBeenCalledWith({ status: 'PENDING' });
  });

  it('route GET with no query forwards empty dto (all entries)', async () => {
    ucMocks.listTimeEntries.mockResolvedValueOnce({ entries: [] });
    const { GET } = await import('@/app/api/time-entries/route');
    const res = await GET(FakeRequestContext({}));
    expect(res.status).toBe(200);
    expect(ucMocks.listTimeEntries).toHaveBeenCalledWith({});
  });

  it('route GET returns 400 on unknown status query', async () => {
    const { GET } = await import('@/app/api/time-entries/route');
    const res = await GET(FakeRequestContext({ query: { status: 'WHATEVER' } }));
    expect(res.status).toBe(400);
    expect(ucMocks.listTimeEntries).not.toHaveBeenCalled();
  });
});

// ============================================================================
// AC-6 · Reports only count APPROVED entries
// ============================================================================

describe('AC-6 · Reports only count APPROVED time entries', () => {
  it('HoursByAreaReport excludes PENDING and REJECTED entries from total_hours', async () => {
    const areas = new FakeAreaRepository();
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();

    const area = makeArea('area-1', 'Engineering');
    await areas.save(area);
    const emp = makeEmployee('emp-1', area.id);
    await employees.save(emp);

    await entries.save(makeEntry('te-A', emp.id, '2026-04-01', 8, 'APPROVED'));
    await entries.save(makeEntry('te-A2', emp.id, '2026-04-02', 5, 'APPROVED'));
    await entries.save(makeEntry('te-P', emp.id, '2026-04-03', 10, 'PENDING'));
    await entries.save(makeEntry('te-R', emp.id, '2026-04-04', 12, 'REJECTED'));

    const result = await new HoursByAreaReportUseCase(areas, employees, entries).execute({
      year: 2026, month: 4,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.area_id).toBe('area-1');
    expect(result[0]!.total_hours).toBe(13); // 8 + 5, NOT 35
    expect(result[0]!.employee_count).toBe(1);
  });

  it('GetEmployeeMonthlyReport excludes PENDING and REJECTED entries from hours_worked', async () => {
    const employees = new FakeEmployeeRepository();
    const entries = new FakeTimeEntryRepository();
    const vacations = new FakeVacationRepository();

    const emp = makeEmployee('emp-1');
    await employees.save(emp);

    await entries.save(makeEntry('te-A', emp.id, '2026-04-01', 8, 'APPROVED'));
    await entries.save(makeEntry('te-A2', emp.id, '2026-04-02', 4, 'APPROVED'));
    await entries.save(makeEntry('te-P', emp.id, '2026-04-03', 9, 'PENDING'));
    await entries.save(makeEntry('te-R', emp.id, '2026-04-04', 11, 'REJECTED'));

    const result = await new GetEmployeeMonthlyReportUseCase(
      employees, entries, vacations,
    ).execute({ employeeId: emp.id, year: 2026 });

    expect(result).toHaveLength(12);
    const april = result.find((m) => m.month === 4)!;
    expect(april.hours_worked).toBe(12); // 8 + 4, NOT 32
  });
});

// ============================================================================
// AC-7 · Audit log records 'time-entry.approved' / 'time-entry.rejected'
// ============================================================================

describe("AC-7 · audit log records 'time-entry.approved' / 'time-entry.rejected'", () => {
  it("approve route writes audit row with action='time-entry.approved'", async () => {
    ucMocks.approveTimeEntry.mockResolvedValueOnce({
      id: 'te-1', status: 'APPROVED',
      approved_at: '2026-04-15T00:00:00.000Z', approved_by: 'mgr',
    });
    const { POST } = await import('@/app/api/time-entries/[id]/approve/route');
    const res = await POST(
      FakeRequestContext({ role: 'manager', actorId: 'mgr' }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(200);
    expect(ucMocks.logAuditEntry).toHaveBeenCalledTimes(1);
    const call = ucMocks.logAuditEntry.mock.calls[0]![0] as any;
    expect(call.action).toBe('time-entry.approved');
    expect(call.resourceType).toBe('time_entry');
    expect(call.resourceId).toBe('te-1');
    expect(call.actorId).toBe('mgr');
  });

  it("reject route writes audit row with action='time-entry.rejected'", async () => {
    ucMocks.rejectTimeEntry.mockResolvedValueOnce({
      id: 'te-1', status: 'REJECTED',
      rejected_at: '2026-04-15T00:00:00.000Z',
      rejected_by: 'mgr', rejection_reason: 'fraud',
    });
    const { POST } = await import('@/app/api/time-entries/[id]/reject/route');
    const res = await POST(
      FakeRequestContext({ role: 'manager', actorId: 'mgr', body: { reason: 'fraud' } }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(200);
    expect(ucMocks.logAuditEntry).toHaveBeenCalledTimes(1);
    const call = ucMocks.logAuditEntry.mock.calls[0]![0] as any;
    expect(call.action).toBe('time-entry.rejected');
    expect(call.resourceType).toBe('time_entry');
    expect(call.resourceId).toBe('te-1');
  });

  it('does NOT write audit when approve fails (422 transition)', async () => {
    ucMocks.approveTimeEntry.mockRejectedValueOnce(new TimeEntryNotPendingError('APPROVED'));
    const { POST } = await import('@/app/api/time-entries/[id]/approve/route');
    const res = await POST(
      FakeRequestContext({ role: 'manager' }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(422);
    expect(ucMocks.logAuditEntry).not.toHaveBeenCalled();
  });
});

// ============================================================================
// AC-8 · Employee role CANNOT approve/reject (role-gate excludes 'employee')
// ============================================================================

describe('AC-8 · employee role is denied at the gate (own entries included)', () => {
  it('POST /api/time-entries/:id/approve with role=employee → 403', async () => {
    const { POST } = await import('@/app/api/time-entries/[id]/approve/route');
    const res = await POST(
      FakeRequestContext({ role: 'employee', actorId: 'emp-1' }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(403);
    expect(ucMocks.approveTimeEntry).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(body.required_roles).toEqual(['admin', 'manager']);
    expect(body.your_role).toBe('employee');
  });

  it('POST /api/time-entries/:id/reject with role=employee → 403', async () => {
    const { POST } = await import('@/app/api/time-entries/[id]/reject/route');
    const res = await POST(
      FakeRequestContext({ role: 'employee', actorId: 'emp-1', body: { reason: 'mine' } }),
      { params: { id: 'te-1' } } as any,
    );
    expect(res.status).toBe(403);
    expect(ucMocks.rejectTimeEntry).not.toHaveBeenCalled();
  });

  it('admin and manager are allowed through the approve gate', async () => {
    ucMocks.approveTimeEntry.mockResolvedValue({
      id: 'te-1', status: 'APPROVED',
      approved_at: '2026-04-15T00:00:00.000Z', approved_by: null,
    });
    const { POST } = await import('@/app/api/time-entries/[id]/approve/route');

    for (const role of ['admin', 'manager'] as const) {
      ucMocks.approveTimeEntry.mockClear();
      const res = await POST(
        FakeRequestContext({ role }),
        { params: { id: 'te-1' } } as any,
      );
      expect(res.status).toBe(200);
      expect(ucMocks.approveTimeEntry).toHaveBeenCalledTimes(1);
    }
  });
});
