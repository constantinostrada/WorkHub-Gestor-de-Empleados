/**
 * T10 — Role-based permissions middleware
 *
 *   AC-1  · Role enum {admin, manager, employee} persisted on Employee (default 'employee')
 *   AC-2  · withRole(allowedRoles) middleware reads X-Role JWT-stub header, 403 on mismatch
 *   AC-3..AC-8 · Per-route gating:
 *     - POST/PATCH/DELETE /api/employees   → admin
 *     - POST/PATCH/DELETE /api/areas       → admin + manager
 *     - POST/approve/reject /api/vacations → admin + manager
 *     - GET /api/audit                     → admin
 *     - GET /api/reports/*                 → admin + manager
 *   AC-9  · Tests at use-case level, using a FakeRequestContext that carries the role
 *   AC-11 · 403 body shape: { error: 'forbidden', required_roles: [...], your_role: ... }
 */

import { Employee } from '@/domain/entities/Employee';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';
import { DEFAULT_ROLE, ROLES, isValidRole, type Role } from '@/domain/value-objects/Role';

import {
  forbiddenResponse,
  readRole,
  withRole,
} from '@/interfaces/http/helpers/withRole';

// ── FakeRequestContext (AC-9) ─────────────────────────────────────────────
// Carries the X-Role header into route handlers. Mirrors the `NextRequest`
// surface that withRole + handlers actually touch (headers.get, json,
// nextUrl.searchParams). Tests pass `role` and we forward it as `x-role`.

interface FakeRequestContextOpts {
  role?: Role | string | null;
  body?: unknown;
  query?: Record<string, string>;
  extraHeaders?: Record<string, string>;
}

function FakeRequestContext(opts: FakeRequestContextOpts = {}): any {
  const headers: Record<string, string> = { ...(opts.extraHeaders ?? {}) };
  if (opts.role !== null && opts.role !== undefined) {
    headers['x-role'] = String(opts.role);
  }
  const bodyText = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return {
    json: async () => opts.body ?? {},
    text: async () => bodyText,
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
    nextUrl: {
      searchParams: new URLSearchParams(opts.query ?? {}),
    },
  };
}

// ── Mock the container — every gated handler calls into it. ───────────────
// Each use case in the real container is an instance with `.execute(dto)`.
// We replace each with a jest.fn() returning a sensible default and expose it
// as `execute` so route handlers calling `container.X.execute(dto)` work.

const ucMocks = {
  createEmployee: jest.fn(async (_dto: unknown) => ({ id: 'emp-1', role: 'employee' })),
  updateEmployee: jest.fn(async (_dto: unknown) => ({ id: 'emp-1', role: 'employee' })),
  deleteEmployee: jest.fn(async (_dto: unknown) => undefined),
  createArea: jest.fn(async (_dto: unknown) => ({ id: 'area-1', name: 'X' })),
  createVacation: jest.fn(async (_dto: unknown) => ({ id: 'vac-1', status: 'pending' })),
  approveVacation: jest.fn(async (_dto: unknown) => ({ id: 'vac-1', status: 'approved' })),
  rejectVacation: jest.fn(async (_dto: unknown) => ({ id: 'vac-1', status: 'rejected' })),
  approveTimeEntry: jest.fn(async (_dto: unknown) => ({
    id: 'te-1', status: 'APPROVED', approved_at: '2026-05-11T00:00:00.000Z', approved_by: null,
  })),
  rejectTimeEntry: jest.fn(async (_dto: unknown) => ({
    id: 'te-1', status: 'REJECTED', rejected_at: '2026-05-11T00:00:00.000Z', rejected_by: null,
    rejection_reason: 'No',
  })),
  listAuditLogs: jest.fn(async (_dto: unknown) => ({ logs: [], total: 0, has_more: false })),
  hoursByAreaReport: jest.fn(async (_dto: unknown) => []),
  vacationsSummaryReport: jest.fn(async (_dto: unknown) => []),
  getEmployeeMonthlyReport: jest.fn(async (_dto: unknown) => ({})),
  logAuditEntry: jest.fn(async (_dto: unknown) => undefined),
};

jest.mock('@/infrastructure/container/container', () => ({
  container: {
    get createEmployee() { return { execute: ucMocks.createEmployee }; },
    get updateEmployee() { return { execute: ucMocks.updateEmployee }; },
    get deleteEmployee() { return { execute: ucMocks.deleteEmployee }; },
    get createArea() { return { execute: ucMocks.createArea }; },
    get createVacation() { return { execute: ucMocks.createVacation }; },
    get approveVacation() { return { execute: ucMocks.approveVacation }; },
    get rejectVacation() { return { execute: ucMocks.rejectVacation }; },
    get approveTimeEntry() { return { execute: ucMocks.approveTimeEntry }; },
    get rejectTimeEntry() { return { execute: ucMocks.rejectTimeEntry }; },
    get listAuditLogs() { return { execute: ucMocks.listAuditLogs }; },
    get hoursByAreaReport() { return { execute: ucMocks.hoursByAreaReport }; },
    get vacationsSummaryReport() { return { execute: ucMocks.vacationsSummaryReport }; },
    get getEmployeeMonthlyReport() { return { execute: ucMocks.getEmployeeMonthlyReport }; },
    get logAuditEntry() { return { execute: ucMocks.logAuditEntry }; },
  },
}));

beforeEach(() => {
  for (const fn of Object.values(ucMocks)) fn.mockClear();
});

// ── Helpers ───────────────────────────────────────────────────────────────

async function readJson(res: Response): Promise<any> {
  return await res.clone().json();
}

function expectForbiddenBody(body: any, required: Role[], your: Role | null): void {
  expect(body).toEqual({
    error: 'forbidden',
    required_roles: required,
    your_role: your,
  });
}

function makeEmployee(overrides: Partial<{ role: Role }> = {}): Employee {
  const now = new Date('2025-01-01T00:00:00.000Z');
  return Employee.create({
    id: 'e1',
    firstName: 'A',
    lastName: 'B',
    email: Email.create('a@b.com'),
    phone: null,
    position: 'engineer',
    salary: Money.create(1, 'EUR'),
    status: EmployeeStatus.ACTIVE,
    hireDate: now,
    areaId: null,
    role: overrides.role ?? 'employee',
    createdAt: now,
    updatedAt: now,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// AC-1 · Role enum + Employee.role field
// ──────────────────────────────────────────────────────────────────────────

describe('AC-1 · Role enum and Employee.role field', () => {
  it('exposes the three roles in order', () => {
    expect([...ROLES]).toEqual(['admin', 'manager', 'employee']);
  });

  it('default role is "employee"', () => {
    expect(DEFAULT_ROLE).toBe('employee');
    expect(Employee.defaultRole()).toBe('employee');
  });

  it('isValidRole accepts every member of ROLES and rejects others', () => {
    for (const r of ROLES) expect(isValidRole(r)).toBe(true);
    expect(isValidRole('engineer')).toBe(false);
    expect(isValidRole('')).toBe(false);
    expect(isValidRole(null)).toBe(false);
    expect(isValidRole(123)).toBe(false);
  });

  it('Employee.create stores the role', () => {
    const e = makeEmployee({ role: 'admin' });
    expect(e.role).toBe('admin');
  });

  it('Employee.create persists the default role when caller passes "employee"', () => {
    const e = makeEmployee();
    expect(e.role).toBe('employee');
  });

  it('Employee.create throws DomainValidationError on invalid role', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    expect(() =>
      Employee.create({
        id: 'e1',
        firstName: 'A',
        lastName: 'B',
        email: Email.create('a@b.com'),
        phone: null,
        position: 'engineer',
        salary: Money.create(1, 'EUR'),
        status: EmployeeStatus.ACTIVE,
        hireDate: now,
        areaId: null,
        role: 'engineer' as unknown as Role,
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow(DomainValidationError);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// AC-2 + AC-11 · withRole middleware contract
// ──────────────────────────────────────────────────────────────────────────

describe('AC-2 · withRole middleware', () => {
  it('readRole returns the parsed role when X-Role header is valid', () => {
    expect(readRole(FakeRequestContext({ role: 'admin' }))).toBe('admin');
    expect(readRole(FakeRequestContext({ role: 'manager' }))).toBe('manager');
    expect(readRole(FakeRequestContext({ role: 'employee' }))).toBe('employee');
  });

  it('readRole returns null for missing / blank / unknown values', () => {
    expect(readRole(FakeRequestContext({}))).toBeNull();
    expect(readRole(FakeRequestContext({ role: '' }))).toBeNull();
    expect(readRole(FakeRequestContext({ role: '   ' }))).toBeNull();
    expect(readRole(FakeRequestContext({ role: 'engineer' }))).toBeNull();
    expect(readRole(FakeRequestContext({ role: 'ADMIN' }))).toBeNull(); // case-sensitive
  });

  it('forwards the request to the inner handler when the role matches', async () => {
    const handler = jest.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withRole(['admin'])(handler as any);
    const req = FakeRequestContext({ role: 'admin' });
    const res = await wrapped(req);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('forwards extra args (Next.js dynamic-segment context) untouched', async () => {
    const handler = jest.fn(async (_req: any, ctx: { params: { id: string } }) => {
      return new Response(ctx.params.id, { status: 200 });
    });
    const wrapped = withRole(['admin'])(handler as any);
    const req = FakeRequestContext({ role: 'admin' });
    const res = await wrapped(req, { params: { id: 'xyz' } } as any);
    expect(await res.text()).toBe('xyz');
  });

  it('rejects with 403 when the X-Role header is missing', async () => {
    const handler = jest.fn();
    const wrapped = withRole(['admin'])(handler as any);
    const res = await wrapped(FakeRequestContext({}));
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    expectForbiddenBody(await readJson(res), ['admin'], null);
  });

  it('rejects with 403 when the X-Role is unknown', async () => {
    const handler = jest.fn();
    const wrapped = withRole(['admin'])(handler as any);
    const res = await wrapped(FakeRequestContext({ role: 'engineer' }));
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    expectForbiddenBody(await readJson(res), ['admin'], null);
  });

  it('rejects with 403 when the role is not in allowedRoles', async () => {
    const handler = jest.fn();
    const wrapped = withRole(['admin', 'manager'])(handler as any);
    const res = await wrapped(FakeRequestContext({ role: 'employee' }));
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    expectForbiddenBody(await readJson(res), ['admin', 'manager'], 'employee');
  });

  it('throws on construction when allowedRoles is empty', () => {
    expect(() => withRole([])(jest.fn() as any)).toThrow();
  });
});

describe('AC-11 · 403 response shape', () => {
  it('forbiddenResponse builds the exact AC-11 shape', async () => {
    const res = forbiddenResponse(['admin'], 'employee');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'forbidden',
      required_roles: ['admin'],
      your_role: 'employee',
    });
  });

  it('forbiddenResponse includes your_role=null when caller is unauthenticated', async () => {
    const res = forbiddenResponse(['admin', 'manager'], null);
    expect(await res.json()).toEqual({
      error: 'forbidden',
      required_roles: ['admin', 'manager'],
      your_role: null,
    });
  });

  it('does not leak roles other than the required ones', async () => {
    const res = forbiddenResponse(['manager'], 'employee');
    const body = await res.json();
    expect(body.required_roles).toEqual(['manager']);
    expect(body.required_roles).not.toContain('admin');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// AC-3..AC-8 · Per-route gating (via FakeRequestContext + container mock)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Run a gated route handler with each role + a missing-role case, asserting
 * deny ⇒ 403 + AC-11 body, allow ⇒ inner handler invoked (use-case mock fired).
 */
async function assertRoleGate(
  invoke: (role: Role | null) => Promise<Response>,
  spy: jest.Mock,
  required: Role[],
): Promise<void> {
  const all: (Role | null)[] = ['admin', 'manager', 'employee', null];
  for (const role of all) {
    spy.mockClear();
    const res = await invoke(role);
    if (role !== null && required.includes(role)) {
      // ALLOW
      expect(spy).toHaveBeenCalledTimes(1);
      expect([200, 201, 204]).toContain(res.status);
    } else {
      // DENY
      expect(spy).not.toHaveBeenCalled();
      expect(res.status).toBe(403);
      expectForbiddenBody(await readJson(res), required, role);
    }
  }
}

// AC-4 · POST/PATCH/DELETE /api/employees → admin only

describe('AC-4 · /api/employees mutations require admin', () => {
  it('POST /api/employees → admin only', async () => {
    const { POST } = await import('@/app/api/employees/route');
    await assertRoleGate(
      (role) =>
        POST(FakeRequestContext({
          role,
          body: { name: 'Jane Doe', email: `jane-${role ?? 'none'}@x.com`, role: 'employee' },
        })),
      ucMocks.createEmployee,
      ['admin'],
    );
  });

  it('PATCH /api/employees/:id → admin only', async () => {
    const { PATCH } = await import('@/app/api/employees/[id]/route');
    await assertRoleGate(
      (role) =>
        PATCH(
          FakeRequestContext({ role, body: { firstName: 'Jane' } }),
          { params: { id: 'e1' } } as any,
        ),
      ucMocks.updateEmployee,
      ['admin'],
    );
  });

  it('DELETE /api/employees/:id → admin only', async () => {
    const { DELETE } = await import('@/app/api/employees/[id]/route');
    await assertRoleGate(
      (role) =>
        DELETE(
          FakeRequestContext({ role }),
          { params: { id: 'e1' } } as any,
        ),
      ucMocks.deleteEmployee,
      ['admin'],
    );
  });
});

// AC-5 · POST /api/areas → admin + manager

describe('AC-5 · /api/areas mutations require admin or manager', () => {
  it('POST /api/areas → admin + manager', async () => {
    const { POST } = await import('@/app/api/areas/route');
    await assertRoleGate(
      (role) =>
        POST(FakeRequestContext({ role, body: { name: 'Engineering' } })),
      ucMocks.createArea,
      ['admin', 'manager'],
    );
  });
});

// AC-6 · /api/vacations creation + approve + reject → admin + manager

describe('AC-6 · /api/vacations transitions require manager (admin override OK)', () => {
  it('POST /api/vacations → admin + manager', async () => {
    const { POST } = await import('@/app/api/vacations/route');
    await assertRoleGate(
      (role) =>
        POST(FakeRequestContext({
          role,
          body: { employee_id: 'e1', start_date: '2025-08-01', end_date: '2025-08-05' },
        })),
      ucMocks.createVacation,
      ['admin', 'manager'],
    );
  });

  it('POST /api/vacations/:id/approve → admin + manager', async () => {
    const { POST } = await import('@/app/api/vacations/[id]/approve/route');
    await assertRoleGate(
      (role) =>
        POST(
          FakeRequestContext({ role }),
          { params: { id: 'v1' } } as any,
        ),
      ucMocks.approveVacation,
      ['admin', 'manager'],
    );
  });

  it('POST /api/vacations/:id/reject → admin + manager', async () => {
    const { POST } = await import('@/app/api/vacations/[id]/reject/route');
    await assertRoleGate(
      (role) =>
        POST(
          FakeRequestContext({ role, body: { reason: 'No' } }),
          { params: { id: 'v1' } } as any,
        ),
      ucMocks.rejectVacation,
      ['admin', 'manager'],
    );
  });

  it('POST /api/time-entries/:id/approve → admin + manager (T14 AC-2/AC-8)', async () => {
    const { POST } = await import('@/app/api/time-entries/[id]/approve/route');
    await assertRoleGate(
      (role) =>
        POST(
          FakeRequestContext({ role }),
          { params: { id: 'te-1' } } as any,
        ),
      ucMocks.approveTimeEntry,
      ['admin', 'manager'],
    );
  });

  it('POST /api/time-entries/:id/reject → admin + manager (T14 AC-2/AC-8)', async () => {
    const { POST } = await import('@/app/api/time-entries/[id]/reject/route');
    await assertRoleGate(
      (role) =>
        POST(
          FakeRequestContext({ role, body: { reason: 'No' } }),
          { params: { id: 'te-1' } } as any,
        ),
      ucMocks.rejectTimeEntry,
      ['admin', 'manager'],
    );
  });
});

// AC-7 · GET /api/audit → admin only

describe('AC-7 · GET /api/audit requires admin', () => {
  it('GET /api/audit → admin only', async () => {
    const { GET } = await import('@/app/api/audit/route');
    await assertRoleGate(
      (role) => GET(FakeRequestContext({ role })),
      ucMocks.listAuditLogs,
      ['admin'],
    );
  });
});

// AC-8 · GET /api/reports/* → admin + manager

describe('AC-8 · GET /api/reports/* requires admin or manager', () => {
  it('GET /api/reports/hours-by-area → admin + manager', async () => {
    const { GET } = await import('@/app/api/reports/hours-by-area/route');
    await assertRoleGate(
      (role) =>
        GET(FakeRequestContext({ role, query: { month: '2025-04' } })),
      ucMocks.hoursByAreaReport,
      ['admin', 'manager'],
    );
  });

  it('GET /api/reports/vacations-summary → admin + manager', async () => {
    const { GET } = await import('@/app/api/reports/vacations-summary/route');
    await assertRoleGate(
      (role) =>
        GET(FakeRequestContext({ role, query: { year: '2025' } })),
      ucMocks.vacationsSummaryReport,
      ['admin', 'manager'],
    );
  });

  it('GET /api/reports/employee/:id/monthly → admin + manager', async () => {
    const { GET } = await import('@/app/api/reports/employee/[id]/monthly/route');
    await assertRoleGate(
      (role) =>
        GET(
          FakeRequestContext({ role, query: { year: '2025' } }),
          { params: { id: 'e1' } } as any,
        ),
      ucMocks.getEmployeeMonthlyReport,
      ['admin', 'manager'],
    );
  });
});
