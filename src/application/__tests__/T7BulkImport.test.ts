/**
 * T7 — Bulk import CSV employees
 *
 *   AC-1 · POST /api/employees/bulk-import (multipart/form-data) accepts CSV
 *          with headers: name,email,role,area_name?,salary?
 *   AC-2 · Email validation (RFC 5322), role enum (employee|manager|admin)
 *   AC-3 · area_name lookup → area_id (404 if area does not exist, optional)
 *   AC-4 · Atomic transaction: if ANY row fails, full rollback
 *   AC-5 · Response shape: { imported: N, errors: [{row, field, message}] }
 *   AC-6 · Email duplicates reject the entire transaction
 */

import { Area } from '@/domain/entities/Area';
import { Employee } from '@/domain/entities/Employee';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type {
  FindEmployeesFilter,
  IEmployeeRepository,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';

import { BulkImportEmployeesUseCase } from '../use-cases/employee/BulkImportEmployeesUseCase';
import { parseCsv } from '@/interfaces/http/helpers/csvParser';

// ── In-memory fakes ────────────────────────────────────────────────────────

class FakeEmployeeRepository implements IEmployeeRepository {
  readonly store = new Map<string, Employee>();
  saveManyShouldFail = false;
  saveManyCalls = 0;

  async findById(id: string): Promise<Employee | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmail(email: string): Promise<Employee | null> {
    for (const e of this.store.values()) if (e.email.value === email) return e;
    return null;
  }
  async findAll(_f?: FindEmployeesFilter, p?: PaginationOptions): Promise<PaginatedResult<Employee>> {
    const items = [...this.store.values()];
    return { items, total: items.length, page: p?.page ?? 1, pageSize: p?.pageSize ?? 20, totalPages: 1 };
  }
  async save(e: Employee): Promise<void> {
    this.store.set(e.id, e);
  }
  async saveMany(employees: Employee[]): Promise<void> {
    this.saveManyCalls++;
    if (this.saveManyShouldFail) {
      throw new Error('simulated transaction failure');
    }
    for (const e of employees) this.store.set(e.id, e);
  }
  async update(e: Employee): Promise<void> {
    this.store.set(e.id, e);
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
  async existsByEmail(email: string): Promise<boolean> {
    return (await this.findByEmail(email)) !== null;
  }
}

class FakeAreaRepository implements IAreaRepository {
  readonly store = new Map<string, Area>();
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
  async save(a: Area): Promise<void> {
    this.store.set(a.id, a);
  }
  async update(a: Area): Promise<void> {
    this.store.set(a.id, a);
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
  async existsById(id: string): Promise<boolean> {
    return this.store.has(id);
  }
}

function makeArea(id: string, name: string): Area {
  const now = new Date('2025-01-01T00:00:00.000Z');
  return Area.create({
    id,
    name,
    description: null,
    managerId: null,
    createdAt: now,
    updatedAt: now,
  });
}

function csvFromRows(rows: Array<Record<string, string>>, headers: string[]): string {
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => r[h] ?? '').join(','));
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock the container so the route handler exercises our fakes.
// ─────────────────────────────────────────────────────────────────────────────

const fakeEmployeeRepo = new FakeEmployeeRepository();
const fakeAreaRepo = new FakeAreaRepository();

jest.mock('@/infrastructure/container/container', () => {
  const {
    BulkImportEmployeesUseCase: BulkUC,
  } = jest.requireActual('../use-cases/employee/BulkImportEmployeesUseCase');
  return {
    container: {
      bulkImportEmployees: new BulkUC(fakeEmployeeRepo, fakeAreaRepo),
      // logAuditEntry is required by the route-level recordAuditEntry helper —
      // provide a permissive stub so the route does not blow up.
      logAuditEntry: { execute: async () => undefined },
    },
  };
});

// Build a NextRequest-compatible mock for the multipart endpoint. We only
// need the surface the route handler touches: `formData()`, `headers.get`.
function makeMultipartRequest(opts: {
  csv?: string | null;
  headers?: Record<string, string>;
  noFile?: boolean;
  formDataThrows?: boolean;
}): any {
  const headers = opts.headers ?? {};
  const fileStub = opts.csv == null
    ? null
    : {
        async text(): Promise<string> {
          return opts.csv as string;
        },
      };
  const formData = new Map<string, unknown>();
  if (!opts.noFile) {
    formData.set('file', fileStub);
  }
  return {
    async formData() {
      if (opts.formDataThrows) throw new Error('not multipart');
      return {
        get: (k: string) => formData.get(k) ?? null,
      };
    },
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · multipart/form-data acceptance and CSV parser headers
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-1 · POST /api/employees/bulk-import accepts multipart/form-data CSV', () => {
  beforeEach(() => {
    fakeEmployeeRepo.store.clear();
    fakeEmployeeRepo.saveManyShouldFail = false;
    fakeEmployeeRepo.saveManyCalls = 0;
    fakeAreaRepo.store.clear();
  });

  it('AC-1 · imports a CSV with required headers (name,email,role) and reports imported count', async () => {
    const csv = csvFromRows(
      [
        { name: 'Alice One', email: 'alice@example.com', role: 'employee' },
        { name: 'Bob Two', email: 'bob@example.com', role: 'manager' },
      ],
      ['name', 'email', 'role'],
    );
    const { POST } = await import('@/app/api/employees/bulk-import/route');
    const res = await POST(makeMultipartRequest({ csv }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ imported: 2, errors: [] });
    expect(fakeEmployeeRepo.store.size).toBe(2);
  });

  it('AC-1 · accepts optional area_name and salary headers', async () => {
    fakeAreaRepo.store.set(
      'area-eng',
      makeArea('area-eng', 'Engineering'),
    );
    const csv = csvFromRows(
      [
        { name: 'Carol', email: 'carol@example.com', role: 'admin', area_name: 'Engineering', salary: '1500' },
      ],
      ['name', 'email', 'role', 'area_name', 'salary'],
    );
    const { POST } = await import('@/app/api/employees/bulk-import/route');
    const res = await POST(makeMultipartRequest({ csv }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.errors).toEqual([]);
    const stored = [...fakeEmployeeRepo.store.values()][0]!;
    expect(stored.areaId).toBe('area-eng');
    expect(stored.salary.amount).toBe(1500);
  });

  it('AC-1 · rejects requests that do not provide a "file" field', async () => {
    const { POST } = await import('@/app/api/employees/bulk-import/route');
    const res = await POST(makeMultipartRequest({ noFile: true, csv: null }));
    expect(res.status).toBe(400);
  });

  it('AC-1 · rejects CSVs missing a required header', async () => {
    const csv = 'name,email\nAlice,a@example.com';
    const { POST } = await import('@/app/api/employees/bulk-import/route');
    const res = await POST(makeMultipartRequest({ csv }));
    expect(res.status).toBe(400);
  });

  it('CSV parser · parses headers and quoted fields correctly', () => {
    const doc = parseCsv('name,email,role\n"Alice, A.",alice@example.com,employee\nBob,bob@example.com,manager\n');
    expect(doc.headers).toEqual(['name', 'email', 'role']);
    expect(doc.rows).toHaveLength(2);
    expect(doc.rows[0]).toEqual({ name: 'Alice, A.', email: 'alice@example.com', role: 'employee' });
    expect(doc.rows[1]).toEqual({ name: 'Bob', email: 'bob@example.com', role: 'manager' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · Email validation + role enum
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-2 · Email validation (RFC 5322) and role enum', () => {
  function freshUseCase(): { uc: BulkImportEmployeesUseCase; emp: FakeEmployeeRepository; area: FakeAreaRepository } {
    const emp = new FakeEmployeeRepository();
    const area = new FakeAreaRepository();
    return { uc: new BulkImportEmployeesUseCase(emp, area), emp, area };
  }

  it('AC-2 · rejects invalid email and persists nothing', async () => {
    const { uc, emp } = freshUseCase();
    const result = await uc.execute([
      { name: 'Alice', email: 'not-an-email', role: 'employee' },
    ]);
    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 1, field: 'email' });
    expect(emp.store.size).toBe(0);
  });

  it('AC-2 · rejects roles outside the enum {employee|manager|admin}', async () => {
    const { uc } = freshUseCase();
    const result = await uc.execute([
      { name: 'Alice', email: 'a@example.com', role: 'ceo' },
    ]);
    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 1, field: 'role' });
  });

  it('AC-2 · accepts all three valid roles', async () => {
    const { uc, emp } = freshUseCase();
    const result = await uc.execute([
      { name: 'A', email: 'a@example.com', role: 'employee' },
      { name: 'B', email: 'b@example.com', role: 'manager' },
      { name: 'C', email: 'c@example.com', role: 'admin' },
    ]);
    expect(result.imported).toBe(3);
    expect(result.errors).toEqual([]);
    expect(emp.store.size).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 · area_name lookup
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-3 · area_name lookup → area_id (optional)', () => {
  it('AC-3 · resolves area_name to areaId when the area exists', async () => {
    const area = new FakeAreaRepository();
    area.store.set('a-1', makeArea('a-1', 'Marketing'));
    const emp = new FakeEmployeeRepository();
    const uc = new BulkImportEmployeesUseCase(emp, area);
    const result = await uc.execute([
      { name: 'Mark', email: 'mark@example.com', role: 'manager', area_name: 'Marketing' },
    ]);
    expect(result.imported).toBe(1);
    expect([...emp.store.values()][0]!.areaId).toBe('a-1');
  });

  it('AC-3 · errors when area_name does not exist (rollback completo)', async () => {
    const area = new FakeAreaRepository();
    const emp = new FakeEmployeeRepository();
    const uc = new BulkImportEmployeesUseCase(emp, area);
    const result = await uc.execute([
      { name: 'Mark', email: 'mark@example.com', role: 'manager', area_name: 'GhostArea' },
    ]);
    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 1, field: 'area_name' });
    expect(emp.store.size).toBe(0);
  });

  it('AC-3 · area_name is optional — omitting it leaves areaId null', async () => {
    const area = new FakeAreaRepository();
    const emp = new FakeEmployeeRepository();
    const uc = new BulkImportEmployeesUseCase(emp, area);
    const result = await uc.execute([
      { name: 'Solo', email: 'solo@example.com', role: 'employee' },
    ]);
    expect(result.imported).toBe(1);
    expect([...emp.store.values()][0]!.areaId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · Atomic transaction
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-4 · Atomic transaction — any row failure rolls back the whole batch', () => {
  it('AC-4 · one bad row causes zero imports across the entire CSV', async () => {
    const area = new FakeAreaRepository();
    const emp = new FakeEmployeeRepository();
    const uc = new BulkImportEmployeesUseCase(emp, area);
    const result = await uc.execute([
      { name: 'Alice', email: 'a@example.com', role: 'employee' },
      { name: 'Bob', email: 'b@example.com', role: 'employee' },
      { name: 'Eve', email: 'not-valid', role: 'employee' },
    ]);
    expect(result.imported).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(emp.store.size).toBe(0);
    // saveMany must NOT have been invoked when validation already failed.
    expect(emp.saveManyCalls).toBe(0);
  });

  it('AC-4 · runtime persistence failure (saveMany throws) surfaces as error and writes nothing', async () => {
    const area = new FakeAreaRepository();
    const emp = new FakeEmployeeRepository();
    emp.saveManyShouldFail = true;
    const uc = new BulkImportEmployeesUseCase(emp, area);
    await expect(
      uc.execute([
        { name: 'Alice', email: 'a@example.com', role: 'employee' },
        { name: 'Bob', email: 'b@example.com', role: 'manager' },
      ]),
    ).rejects.toThrow(/rolled back/i);
    expect(emp.store.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · Response shape
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-5 · Response shape { imported, errors: [{row (1-indexed), field, message}] }', () => {
  it('AC-5 · errors carry 1-indexed row, field name, and a message', async () => {
    const area = new FakeAreaRepository();
    const emp = new FakeEmployeeRepository();
    const uc = new BulkImportEmployeesUseCase(emp, area);
    const result = await uc.execute([
      { name: 'Alice', email: 'a@example.com', role: 'employee' }, // valid (row 1)
      { name: 'Bob', email: 'bob-bad', role: 'admin' },             // bad email at row 2
      { name: '', email: 'c@example.com', role: 'phantom' },         // bad name+role at row 3
    ]);
    expect(result.imported).toBe(0);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: 'email' }),
      expect.objectContaining({ row: 3, field: 'name' }),
      expect.objectContaining({ row: 3, field: 'role' }),
    ]));
    for (const err of result.errors) {
      expect(typeof err.message).toBe('string');
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  it('AC-5 · happy path returns { imported: N, errors: [] }', async () => {
    const area = new FakeAreaRepository();
    const emp = new FakeEmployeeRepository();
    const uc = new BulkImportEmployeesUseCase(emp, area);
    const result = await uc.execute([
      { name: 'A', email: 'a@example.com', role: 'employee' },
      { name: 'B', email: 'b@example.com', role: 'manager' },
    ]);
    expect(result).toEqual({ imported: 2, errors: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · Email duplicates reject the entire transaction
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-6 · Email duplicates reject the entire transaction with a specific error', () => {
  it('AC-6 · duplicate emails within the CSV cause full rollback', async () => {
    const area = new FakeAreaRepository();
    const emp = new FakeEmployeeRepository();
    const uc = new BulkImportEmployeesUseCase(emp, area);
    const result = await uc.execute([
      { name: 'Alice', email: 'dup@example.com', role: 'employee' },
      { name: 'Other', email: 'unique@example.com', role: 'employee' },
      { name: 'Alice2', email: 'dup@example.com', role: 'manager' },
    ]);
    expect(result.imported).toBe(0);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row: 3,
          field: 'email',
          message: expect.stringMatching(/duplicate/i),
        }),
      ]),
    );
    expect(emp.store.size).toBe(0);
  });

  it('AC-6 · duplicate against an already-persisted email causes full rollback', async () => {
    const area = new FakeAreaRepository();
    const emp = new FakeEmployeeRepository();
    const existing = Employee.create({
      id: 'e-existing',
      firstName: 'Existing',
      lastName: 'User',
      email: (await import('@/domain/value-objects/Email')).Email.create('exists@example.com'),
      phone: null,
      position: 'employee',
      salary: (await import('@/domain/value-objects/Money')).Money.create(1, 'EUR'),
      status: (await import('@/domain/value-objects/EmployeeStatus')).EmployeeStatus.ACTIVE,
      hireDate: new Date('2025-01-01'),
      areaId: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    });
    await emp.save(existing);

    const uc = new BulkImportEmployeesUseCase(emp, area);
    const result = await uc.execute([
      { name: 'New One', email: 'new@example.com', role: 'employee' },
      { name: 'Conflict', email: 'exists@example.com', role: 'manager' },
    ]);
    expect(result.imported).toBe(0);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row: 2,
          field: 'email',
          message: expect.stringMatching(/already exists/i),
        }),
      ]),
    );
    // The existing single row remains; nothing else was inserted.
    expect(emp.store.size).toBe(1);
  });
});
