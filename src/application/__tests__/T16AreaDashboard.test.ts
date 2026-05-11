/**
 * T16 — Area performance dashboard.
 *
 *   AC-1 · GET /api/areas/:id/dashboard requires admin OR manager (HTTP layer).
 *   AC-2 · Missing/invalid `from` or `to` → 400 code MISSING_DATE_RANGE.
 *   AC-3 · 200 shape { headcount_active, total_hours, vacation_days,
 *          avg_approval_hours, top_employees: [{ id, name, hours }] }.
 *   AC-4 · headcount_active counts only ACTIVE employees of the area.
 *   AC-5 · total_hours sums entries whose date is in [from, to] inclusive.
 *   AC-6 · vacation_days clips APPROVED-vacation overlap to the range.
 *   AC-7 · avg_approval_hours over APPROVED vacations whose createdAt ∈ range.
 *   AC-8 · top_employees: top 5 by hours desc; <5 returns what exists.
 *   AC-9 · Unknown area → 404 code AREA_NOT_FOUND.
 */

import { randomUUID } from 'node:crypto';

import { GetAreaDashboardUseCase } from '../use-cases/report/GetAreaDashboardUseCase';

import { Area } from '@/domain/entities/Area';
import { Employee } from '@/domain/entities/Employee';
import { TimeEntry } from '@/domain/entities/TimeEntry';
import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
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

// ── Container mock (used by the HTTP route tests below). ─────────────────────
// The use-case tests instantiate their own use case + fakes and don't touch
// the container; the mock is here so the route's `import { container } from
// '@/infrastructure/container/container'` resolves without spinning up Prisma.

const areaDashboardMock = {
  execute: jest.fn(async (_dto: unknown) => ({
    headcount_active: 0,
    total_hours: 0,
    vacation_days: 0,
    avg_approval_hours: 0,
    top_employees: [],
  })),
};

jest.mock('@/infrastructure/container/container', () => ({
  container: {
    get areaDashboard() {
      return areaDashboardMock;
    },
  },
}));

// ── Fake repositories ────────────────────────────────────────────────────────

class FakeAreaRepository implements IAreaRepository {
  readonly store = new Map<string, Area>();
  async findById(id: string): Promise<Area | null> {
    return this.store.get(id) ?? null;
  }
  async findByName(): Promise<Area | null> { return null; }
  async findAll(): Promise<Area[]> { return [...this.store.values()]; }
  async save(a: Area): Promise<void> { this.store.set(a.id, a); }
  async update(a: Area): Promise<void> { this.store.set(a.id, a); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsById(id: string): Promise<boolean> { return this.store.has(id); }
}

class FakeEmployeeRepository implements IEmployeeRepository {
  readonly store = new Map<string, Employee>();
  async findById(id: string): Promise<Employee | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmail(): Promise<Employee | null> { return null; }
  async findAll(
    filter?: FindEmployeesFilter,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<Employee>> {
    let items = [...this.store.values()];
    if (filter?.areaId !== undefined) {
      items = items.filter((e) => e.areaId === filter.areaId);
    }
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? Math.max(1, items.length);
    return {
      items,
      total: items.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    };
  }
  async save(e: Employee): Promise<void> { this.store.set(e.id, e); }
  async update(e: Employee): Promise<void> { this.store.set(e.id, e); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsByEmail(): Promise<boolean> { return false; }
}

class FakeTimeEntryRepository implements ITimeEntryRepository {
  readonly entries: TimeEntry[] = [];
  async save(e: TimeEntry): Promise<void> { this.entries.push(e); }
  async findByEmployeeAndDate(
    employeeId: string,
    date: Date,
  ): Promise<TimeEntry | null> {
    const day = toUtcDayMs(date);
    return (
      this.entries.find(
        (e) => e.employeeId === employeeId && toUtcDayMs(e.date) === day,
      ) ?? null
    );
  }
  async findByEmployeeInRange(
    employeeId: string,
    from: Date,
    to: Date,
  ): Promise<TimeEntry[]> {
    const fromMs = toUtcDayMs(from);
    const toMs = toUtcDayMs(to);
    return this.entries.filter((e) => {
      if (e.employeeId !== employeeId) return false;
      const d = toUtcDayMs(e.date);
      return d >= fromMs && d <= toMs;
    });
  }
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
    const fromMs = from.getTime();
    const toMs = to.getTime();
    return [...this.store.values()].filter((v) => {
      if (v.employeeId !== employeeId) return false;
      if (statuses && !statuses.includes(v.status)) return false;
      const vStart = v.startDate.getTime();
      const vEnd = v.endDate.getTime();
      return vEnd >= fromMs && vStart <= toMs;
    });
  }
  async findOverlapping(): Promise<Vacation[]> { return []; }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toUtcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function makeArea(name = 'Engineering'): Area {
  return Area.create({
    id: randomUUID(),
    name,
    description: null,
    managerId: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  });
}

function makeEmployee(
  areaId: string | null,
  overrides: Partial<{
    id: string;
    firstName: string;
    lastName: string;
    status: EmployeeStatus;
  }> = {},
): Employee {
  const id = overrides.id ?? randomUUID();
  return Employee.create({
    id,
    firstName: overrides.firstName ?? 'Ana',
    lastName: overrides.lastName ?? 'Lopez',
    email: Email.create(`emp-${id.slice(0, 8)}@acme.test`),
    phone: null,
    position: 'engineer',
    salary: Money.create(1000, 'EUR'),
    status: overrides.status ?? EmployeeStatus.ACTIVE,
    hireDate: new Date('2024-01-01T00:00:00Z'),
    areaId,
    role: 'employee',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  });
}

function makeTimeEntry(employeeId: string, isoDate: string, hours: number): TimeEntry {
  return TimeEntry.create({
    id: randomUUID(),
    employeeId,
    date: new Date(isoDate),
    hours,
    notes: null,
    createdAt: new Date(isoDate),
    updatedAt: new Date(isoDate),
  });
}

function makeVacation(opts: {
  employeeId: string;
  startDate: string;
  endDate: string;
  status?: VacationStatus;
  createdAt?: string;
  updatedAt?: string;
}): Vacation {
  return Vacation.create({
    id: randomUUID(),
    employeeId: opts.employeeId,
    startDate: new Date(opts.startDate),
    endDate: new Date(opts.endDate),
    status: opts.status ?? 'APPROVED',
    createdAt: opts.createdAt
      ? new Date(opts.createdAt)
      : new Date('2025-01-01T00:00:00Z'),
    updatedAt: opts.updatedAt
      ? new Date(opts.updatedAt)
      : new Date('2025-01-02T00:00:00Z'),
  });
}

// ── Use-case-level tests (AC-3..AC-9) ────────────────────────────────────────

describe('T16 — GetAreaDashboardUseCase', () => {
  let areaRepo: FakeAreaRepository;
  let employeeRepo: FakeEmployeeRepository;
  let timeEntryRepo: FakeTimeEntryRepository;
  let vacationRepo: FakeVacationRepository;
  let useCase: GetAreaDashboardUseCase;

  beforeEach(() => {
    areaRepo = new FakeAreaRepository();
    employeeRepo = new FakeEmployeeRepository();
    timeEntryRepo = new FakeTimeEntryRepository();
    vacationRepo = new FakeVacationRepository();
    useCase = new GetAreaDashboardUseCase(
      areaRepo,
      employeeRepo,
      timeEntryRepo,
      vacationRepo,
    );
  });

  describe('AC-3 · response shape', () => {
    it('returns the snake_case shape with all 5 metrics', async () => {
      const area = makeArea('Engineering');
      await areaRepo.save(area);

      const result = await useCase.execute({
        areaId: area.id,
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-03-31T00:00:00Z'),
      });

      expect(Object.keys(result).sort()).toEqual([
        'avg_approval_hours',
        'headcount_active',
        'top_employees',
        'total_hours',
        'vacation_days',
      ]);
      expect(Array.isArray(result.top_employees)).toBe(true);
    });
  });

  describe('AC-4 · headcount_active excludes offboarded (INACTIVE)', () => {
    it('counts only ACTIVE employees of the area', async () => {
      const area = makeArea();
      await areaRepo.save(area);
      await employeeRepo.save(makeEmployee(area.id, { status: EmployeeStatus.ACTIVE }));
      await employeeRepo.save(makeEmployee(area.id, { status: EmployeeStatus.ACTIVE }));
      await employeeRepo.save(makeEmployee(area.id, { status: EmployeeStatus.INACTIVE }));
      await employeeRepo.save(makeEmployee('other-area', { status: EmployeeStatus.ACTIVE }));

      const result = await useCase.execute({
        areaId: area.id,
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-03-31T00:00:00Z'),
      });

      expect(result.headcount_active).toBe(2);
    });
  });

  describe('AC-5 · total_hours respects [from, to] inclusive', () => {
    it('sums entries inside the range and excludes entries outside', async () => {
      const area = makeArea();
      await areaRepo.save(area);
      const emp = makeEmployee(area.id);
      await employeeRepo.save(emp);
      await timeEntryRepo.save(makeTimeEntry(emp.id, '2026-03-01T00:00:00Z', 4));
      await timeEntryRepo.save(makeTimeEntry(emp.id, '2026-03-15T00:00:00Z', 8));
      await timeEntryRepo.save(makeTimeEntry(emp.id, '2026-03-31T00:00:00Z', 2));
      await timeEntryRepo.save(makeTimeEntry(emp.id, '2026-02-28T00:00:00Z', 5));
      await timeEntryRepo.save(makeTimeEntry(emp.id, '2026-04-01T00:00:00Z', 6));

      const result = await useCase.execute({
        areaId: area.id,
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-03-31T00:00:00Z'),
      });

      expect(result.total_hours).toBe(14);
    });

    it('includes both endpoints (inclusive boundary)', async () => {
      const area = makeArea();
      await areaRepo.save(area);
      const emp = makeEmployee(area.id);
      await employeeRepo.save(emp);
      await timeEntryRepo.save(makeTimeEntry(emp.id, '2026-03-01T00:00:00Z', 1));
      await timeEntryRepo.save(makeTimeEntry(emp.id, '2026-03-31T00:00:00Z', 2));

      const result = await useCase.execute({
        areaId: area.id,
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-03-31T00:00:00Z'),
      });

      expect(result.total_hours).toBe(3);
    });
  });

  describe('AC-6 · vacation_days counts only APPROVED clipped to range', () => {
    it('clips partially-overlapping APPROVED vacations and ignores other statuses', async () => {
      const area = makeArea();
      await areaRepo.save(area);
      const emp = makeEmployee(area.id);
      await employeeRepo.save(emp);
      // Fully inside: May 10..12 → 3 days
      await vacationRepo.save(
        makeVacation({
          employeeId: emp.id,
          startDate: '2026-03-10T00:00:00Z',
          endDate: '2026-03-12T00:00:00Z',
          status: 'APPROVED',
        }),
      );
      // Partially outside: Apr 28..May 02 → clip → May 01..May 02 → 2 days
      await vacationRepo.save(
        makeVacation({
          employeeId: emp.id,
          startDate: '2026-02-26T00:00:00Z',
          endDate: '2026-03-02T00:00:00Z',
          status: 'APPROVED',
        }),
      );
      // PENDING/REJECTED/CANCELLED → ignored
      await vacationRepo.save(
        makeVacation({
          employeeId: emp.id,
          startDate: '2026-03-20T00:00:00Z',
          endDate: '2026-03-22T00:00:00Z',
          status: 'PENDING',
        }),
      );
      await vacationRepo.save(
        makeVacation({
          employeeId: emp.id,
          startDate: '2026-03-25T00:00:00Z',
          endDate: '2026-03-27T00:00:00Z',
          status: 'REJECTED',
        }),
      );

      const result = await useCase.execute({
        areaId: area.id,
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-03-31T00:00:00Z'),
      });

      expect(result.vacation_days).toBe(5);
    });
  });

  describe('AC-7 · avg_approval_hours', () => {
    it('averages (updatedAt - createdAt) over APPROVED vacations whose createdAt ∈ range', async () => {
      const area = makeArea();
      await areaRepo.save(area);
      const emp = makeEmployee(area.id);
      await employeeRepo.save(emp);
      // 2h approval, createdAt in range
      await vacationRepo.save(
        makeVacation({
          employeeId: emp.id,
          startDate: '2026-04-01T00:00:00Z',
          endDate: '2026-06-05T00:00:00Z',
          status: 'APPROVED',
          createdAt: '2026-03-10T08:00:00Z',
          updatedAt: '2026-03-10T10:00:00Z',
        }),
      );
      // 6h approval, createdAt in range
      await vacationRepo.save(
        makeVacation({
          employeeId: emp.id,
          startDate: '2026-06-10T00:00:00Z',
          endDate: '2026-06-12T00:00:00Z',
          status: 'APPROVED',
          createdAt: '2026-03-15T12:00:00Z',
          updatedAt: '2026-03-15T18:00:00Z',
        }),
      );
      // createdAt outside range → excluded
      await vacationRepo.save(
        makeVacation({
          employeeId: emp.id,
          startDate: '2026-07-01T00:00:00Z',
          endDate: '2026-07-05T00:00:00Z',
          status: 'APPROVED',
          createdAt: '2026-04-25T08:00:00Z',
          updatedAt: '2026-04-25T18:00:00Z',
        }),
      );
      // PENDING (not approved) → excluded
      await vacationRepo.save(
        makeVacation({
          employeeId: emp.id,
          startDate: '2026-08-01T00:00:00Z',
          endDate: '2026-08-05T00:00:00Z',
          status: 'PENDING',
          createdAt: '2026-03-20T08:00:00Z',
          updatedAt: '2026-03-20T08:00:00Z',
        }),
      );

      const result = await useCase.execute({
        areaId: area.id,
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-03-31T23:59:59Z'),
      });

      expect(result.avg_approval_hours).toBe(4); // (2 + 6) / 2
    });

    it('returns 0 when there are no qualifying APPROVED vacations', async () => {
      const area = makeArea();
      await areaRepo.save(area);
      const emp = makeEmployee(area.id);
      await employeeRepo.save(emp);

      const result = await useCase.execute({
        areaId: area.id,
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-03-31T23:59:59Z'),
      });

      expect(result.avg_approval_hours).toBe(0);
    });
  });

  describe('AC-8 · top_employees', () => {
    it('returns top 5 by hours desc with name=firstName+" "+lastName', async () => {
      const area = makeArea();
      await areaRepo.save(area);
      const emps = ['Ana', 'Bob', 'Cara', 'Dan', 'Eve', 'Fei'].map((fn, i) =>
        makeEmployee(area.id, { firstName: fn, lastName: `L${i}` }),
      );
      for (const e of emps) await employeeRepo.save(e);
      const hours = [1, 3, 6, 9, 12, 15]; // Fei has the most
      for (let i = 0; i < emps.length; i++) {
        await timeEntryRepo.save(
          makeTimeEntry(emps[i]!.id, '2026-03-10T00:00:00Z', hours[i]!),
        );
      }

      const result = await useCase.execute({
        areaId: area.id,
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-03-31T00:00:00Z'),
      });

      expect(result.top_employees).toHaveLength(5);
      expect(result.top_employees.map((t) => t.name)).toEqual([
        'Fei L5',
        'Eve L4',
        'Dan L3',
        'Cara L2',
        'Bob L1',
      ]);
      expect(result.top_employees[0]!.hours).toBe(15);
      expect(result.top_employees[0]!.id).toBe(emps[5]!.id);
    });

    it('returns only what exists when the area has fewer than 5 employees', async () => {
      const area = makeArea();
      await areaRepo.save(area);
      const e1 = makeEmployee(area.id, { firstName: 'Solo', lastName: 'One' });
      const e2 = makeEmployee(area.id, { firstName: 'Duo', lastName: 'Two' });
      await employeeRepo.save(e1);
      await employeeRepo.save(e2);
      await timeEntryRepo.save(makeTimeEntry(e1.id, '2026-03-10T00:00:00Z', 3));
      await timeEntryRepo.save(makeTimeEntry(e2.id, '2026-03-11T00:00:00Z', 8));

      const result = await useCase.execute({
        areaId: area.id,
        from: new Date('2026-03-01T00:00:00Z'),
        to: new Date('2026-03-31T00:00:00Z'),
      });

      expect(result.top_employees).toHaveLength(2);
      expect(result.top_employees[0]!.name).toBe('Duo Two');
      expect(result.top_employees[1]!.name).toBe('Solo One');
    });
  });

  describe('AC-9 · unknown area throws DomainNotFoundError(Area)', () => {
    it('throws DomainNotFoundError with resourceType=Area', async () => {
      await expect(
        useCase.execute({
          areaId: 'nonexistent-area',
          from: new Date('2026-03-01T00:00:00Z'),
          to: new Date('2026-03-31T00:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(DomainNotFoundError);

      try {
        await useCase.execute({
          areaId: 'nonexistent-area',
          from: new Date('2026-03-01T00:00:00Z'),
          to: new Date('2026-03-31T00:00:00Z'),
        });
      } catch (err) {
        expect((err as DomainNotFoundError).resourceType).toBe('Area');
      }
    });
  });

  describe('input validation', () => {
    it('rejects from > to with DomainValidationError', async () => {
      const area = makeArea();
      await areaRepo.save(area);
      await expect(
        useCase.execute({
          areaId: area.id,
          from: new Date('2026-04-01T00:00:00Z'),
          to: new Date('2026-03-01T00:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(DomainValidationError);
    });
  });
});

// ── HTTP route tests (AC-1, AC-2, AC-9 status code mapping) ─────────────────

function makeReq(url: string, role?: string): unknown {
  const headers = new Headers();
  if (role) headers.set('x-role', role);
  const req = new Request(url, { headers });
  Object.defineProperty(req, 'nextUrl', {
    value: new URL(url),
    configurable: true,
  });
  return req;
}

describe('T16 — HTTP route /api/areas/[id]/dashboard', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GET } = require('@/app/api/areas/[id]/dashboard/route');

  beforeEach(() => {
    areaDashboardMock.execute.mockReset();
  });

  describe('AC-1 · role gating', () => {
    it('rejects callers without manager or admin role with 403', async () => {
      const req = makeReq(
        'http://x/api/areas/AREA/dashboard?from=2026-03-01&to=2026-03-31',
        'employee',
      );
      const res = await GET(req, { params: { id: 'AREA' } });
      expect(res.status).toBe(403);
      expect(areaDashboardMock.execute).not.toHaveBeenCalled();
    });

    it('rejects callers with no role at all', async () => {
      const req = makeReq(
        'http://x/api/areas/AREA/dashboard?from=2026-03-01&to=2026-03-31',
      );
      const res = await GET(req, { params: { id: 'AREA' } });
      expect(res.status).toBe(403);
    });

    it('admits admin role (200 happy path)', async () => {
      areaDashboardMock.execute.mockResolvedValueOnce({
        headcount_active: 0,
        total_hours: 0,
        vacation_days: 0,
        avg_approval_hours: 0,
        top_employees: [],
      });
      const req = makeReq(
        'http://x/api/areas/AREA/dashboard?from=2026-03-01&to=2026-03-31',
        'admin',
      );
      const res = await GET(req, { params: { id: 'AREA' } });
      expect(res.status).toBe(200);
      expect(areaDashboardMock.execute).toHaveBeenCalledWith({
        areaId: 'AREA',
        from: new Date('2026-03-01'),
        to: new Date('2026-03-31'),
      });
    });

    it('admits manager role', async () => {
      areaDashboardMock.execute.mockResolvedValueOnce({
        headcount_active: 0,
        total_hours: 0,
        vacation_days: 0,
        avg_approval_hours: 0,
        top_employees: [],
      });
      const req = makeReq(
        'http://x/api/areas/AREA/dashboard?from=2026-03-01&to=2026-03-31',
        'manager',
      );
      const res = await GET(req, { params: { id: 'AREA' } });
      expect(res.status).toBe(200);
    });
  });

  describe('AC-2 · MISSING_DATE_RANGE', () => {
    it('returns 400 code=MISSING_DATE_RANGE when `from` is missing', async () => {
      const req = makeReq(
        'http://x/api/areas/AREA/dashboard?to=2026-03-31',
        'admin',
      );
      const res = await GET(req, { params: { id: 'AREA' } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('MISSING_DATE_RANGE');
      expect(areaDashboardMock.execute).not.toHaveBeenCalled();
    });

    it('returns 400 code=MISSING_DATE_RANGE when `to` is missing', async () => {
      const req = makeReq(
        'http://x/api/areas/AREA/dashboard?from=2026-03-01',
        'admin',
      );
      const res = await GET(req, { params: { id: 'AREA' } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('MISSING_DATE_RANGE');
    });

    it('returns 400 code=MISSING_DATE_RANGE when both are missing', async () => {
      const req = makeReq('http://x/api/areas/AREA/dashboard', 'admin');
      const res = await GET(req, { params: { id: 'AREA' } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('MISSING_DATE_RANGE');
    });

    it('returns 400 code=MISSING_DATE_RANGE when params are not parseable dates', async () => {
      const req = makeReq(
        'http://x/api/areas/AREA/dashboard?from=not-a-date&to=2026-03-31',
        'admin',
      );
      const res = await GET(req, { params: { id: 'AREA' } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('MISSING_DATE_RANGE');
    });
  });

  describe('AC-9 · AREA_NOT_FOUND', () => {
    it('maps DomainNotFoundError(Area) → 404 code=AREA_NOT_FOUND', async () => {
      areaDashboardMock.execute.mockRejectedValueOnce(
        new DomainNotFoundError('Area', 'unknown'),
      );
      const req = makeReq(
        'http://x/api/areas/UNKNOWN/dashboard?from=2026-03-01&to=2026-03-31',
        'admin',
      );
      const res = await GET(req, { params: { id: 'UNKNOWN' } });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('AREA_NOT_FOUND');
    });
  });
});
