/**
 * T2 — Endpoints de empleados y áreas
 *
 * One describe per acceptance criterion. Tests run at the use-case level —
 * route handlers are thin pass-throughs that translate snake_case ↔ camelCase
 * and delegate to the same use cases exercised here. AC-6 (404 vs 500) is
 * covered by asserting the use cases throw `DomainNotFoundError`, which
 * `handleError` maps to HTTP 404.
 */

import { Area } from '@/domain/entities/Area';
import { Employee } from '@/domain/entities/Employee';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
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

import { CreateAreaUseCase } from '../use-cases/area/CreateAreaUseCase';
import { GetAreaWithMembersUseCase } from '../use-cases/area/GetAreaWithMembersUseCase';
import { CreateEmployeeUseCase } from '../use-cases/employee/CreateEmployeeUseCase';
import { GetEmployeeUseCase } from '../use-cases/employee/GetEmployeeUseCase';
import { ListEmployeesUseCase } from '../use-cases/employee/ListEmployeesUseCase';
import { UpdateEmployeeUseCase } from '../use-cases/employee/UpdateEmployeeUseCase';

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
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 20;
    return { items, total: items.length, page, pageSize, totalPages: 1 };
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

class FakeAreaRepository implements IAreaRepository {
  readonly store: Map<string, Area> = new Map();

  async findById(id: string): Promise<Area | null> {
    return this.store.get(id) ?? null;
  }
  async findByName(name: string): Promise<Area | null> {
    for (const area of this.store.values()) {
      if (area.name === name) return area;
    }
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

// ── Helpers ─────────────────────────────────────────────────────────────────

function seedArea(repo: FakeAreaRepository, id: string, name: string): Area {
  const now = new Date();
  const area = Area.create({
    id,
    name,
    description: null,
    managerId: null,
    createdAt: now,
    updatedAt: now,
  });
  repo.store.set(area.id, area);
  return area;
}

function seedEmployee(
  repo: FakeEmployeeRepository,
  opts: { id: string; firstName: string; lastName: string; email: string; areaId: string | null; position?: string },
): Employee {
  const now = new Date();
  const emp = Employee.create({
    id: opts.id,
    firstName: opts.firstName,
    lastName: opts.lastName,
    email: Email.create(opts.email),
    phone: null,
    position: opts.position ?? 'Engineer',
    salary: Money.create(1, 'EUR'),
    status: EmployeeStatus.ACTIVE,
    hireDate: now,
    areaId: opts.areaId,
    createdAt: now,
    updatedAt: now,
  });
  repo.store.set(emp.id, emp);
  return emp;
}

const SAMPLE_AREA_ID = '00000000-0000-0000-0000-000000000001';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AC-1 · POST /api/employees creates an employee (no area initially)', () => {
  it('creates an employee from {name, email, role} without an area', async () => {
    const employees = new FakeEmployeeRepository();
    const areas = new FakeAreaRepository();
    const useCase = new CreateEmployeeUseCase(employees, areas);

    const result = await useCase.execute({
      firstName: 'Ana',
      lastName: '-',
      email: 'ana@workhub.com',
      position: 'Engineer',
      salary: 0.01,
      hireDate: new Date().toISOString(),
      areaId: null,
    });

    expect(result.fullName).toBe('Ana -');
    expect(result.email).toBe('ana@workhub.com');
    expect(result.position).toBe('Engineer');
    expect(result.areaId).toBeNull();
    expect(employees.store.size).toBe(1);
  });
});

describe('AC-2 · POST /api/areas creates an area', () => {
  it('creates an area from {name, description?, manager_id?}', async () => {
    const areas = new FakeAreaRepository();
    const useCase = new CreateAreaUseCase(areas);

    const result = await useCase.execute({
      name: 'Engineering',
      description: 'Software team',
      managerId: null,
    });

    expect(result.name).toBe('Engineering');
    expect(result.description).toBe('Software team');
    expect(result.managerId).toBeNull();
    expect(areas.store.size).toBe(1);
  });

  it('creates an area with only the name', async () => {
    const areas = new FakeAreaRepository();
    const useCase = new CreateAreaUseCase(areas);

    const result = await useCase.execute({ name: 'Sales' });

    expect(result.name).toBe('Sales');
    expect(result.description).toBeNull();
    expect(result.managerId).toBeNull();
  });
});

describe('AC-3 · PUT /api/employees/:id assigns or clears area_id', () => {
  it('assigns the employee to an area', async () => {
    const employees = new FakeEmployeeRepository();
    const areas = new FakeAreaRepository();
    seedArea(areas, SAMPLE_AREA_ID, 'Engineering');
    seedEmployee(employees, {
      id: 'emp-1',
      firstName: 'Ana',
      lastName: '-',
      email: 'ana@workhub.com',
      areaId: null,
    });

    const result = await new UpdateEmployeeUseCase(employees, areas).execute({
      id: 'emp-1',
      areaId: SAMPLE_AREA_ID,
    });

    expect(result.areaId).toBe(SAMPLE_AREA_ID);
  });

  it('clears the area when area_id is null', async () => {
    const employees = new FakeEmployeeRepository();
    const areas = new FakeAreaRepository();
    seedArea(areas, SAMPLE_AREA_ID, 'Engineering');
    seedEmployee(employees, {
      id: 'emp-1',
      firstName: 'Ana',
      lastName: '-',
      email: 'ana@workhub.com',
      areaId: SAMPLE_AREA_ID,
    });

    const result = await new UpdateEmployeeUseCase(employees, areas).execute({
      id: 'emp-1',
      areaId: null,
    });

    expect(result.areaId).toBeNull();
  });
});

describe('AC-4 · GET /api/areas/:id returns area with members', () => {
  it('returns {id, name, description, manager_id, members:[{id, name, role, joined_at}]}', async () => {
    const employees = new FakeEmployeeRepository();
    const areas = new FakeAreaRepository();
    seedArea(areas, SAMPLE_AREA_ID, 'Engineering');
    seedEmployee(employees, {
      id: 'emp-1',
      firstName: 'Ana',
      lastName: 'García',
      email: 'ana@workhub.com',
      areaId: SAMPLE_AREA_ID,
      position: 'Senior Engineer',
    });
    seedEmployee(employees, {
      id: 'emp-2',
      firstName: 'Bob',
      lastName: 'Doe',
      email: 'bob@workhub.com',
      areaId: null, // not a member
    });

    const result = await new GetAreaWithMembersUseCase(areas, employees).execute({
      id: SAMPLE_AREA_ID,
    });

    expect(result).toEqual({
      id: SAMPLE_AREA_ID,
      name: 'Engineering',
      description: null,
      manager_id: null,
      members: [
        {
          id: 'emp-1',
          name: 'Ana García',
          role: 'Senior Engineer',
          joined_at: expect.any(String),
        },
      ],
    });
    expect(result.members[0]?.joined_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('AC-5 · GET /api/employees lists all or filters by area_id', () => {
  it('lists every employee when no filter is provided', async () => {
    const employees = new FakeEmployeeRepository();
    seedEmployee(employees, { id: 'a', firstName: 'A', lastName: '-', email: 'a@w.com', areaId: null });
    seedEmployee(employees, { id: 'b', firstName: 'B', lastName: '-', email: 'b@w.com', areaId: SAMPLE_AREA_ID });

    const result = await new ListEmployeesUseCase(employees).execute({});

    expect(result.total).toBe(2);
    expect(result.items.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('filters employees by area_id', async () => {
    const employees = new FakeEmployeeRepository();
    seedEmployee(employees, { id: 'a', firstName: 'A', lastName: '-', email: 'a@w.com', areaId: null });
    seedEmployee(employees, { id: 'b', firstName: 'B', lastName: '-', email: 'b@w.com', areaId: SAMPLE_AREA_ID });
    seedEmployee(employees, { id: 'c', firstName: 'C', lastName: '-', email: 'c@w.com', areaId: SAMPLE_AREA_ID });

    const result = await new ListEmployeesUseCase(employees).execute({ areaId: SAMPLE_AREA_ID });

    expect(result.total).toBe(2);
    expect(result.items.every((e) => e.areaId === SAMPLE_AREA_ID)).toBe(true);
  });
});

describe('AC-6 · Missing id returns 404 (DomainNotFoundError, not 500)', () => {
  it('GET /api/employees/:id throws DomainNotFoundError for unknown id', async () => {
    const useCase = new GetEmployeeUseCase(new FakeEmployeeRepository());
    await expect(useCase.execute({ id: 'missing' })).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  it('PUT /api/employees/:id throws DomainNotFoundError for unknown id', async () => {
    const useCase = new UpdateEmployeeUseCase(new FakeEmployeeRepository(), new FakeAreaRepository());
    await expect(useCase.execute({ id: 'missing', areaId: null })).rejects.toBeInstanceOf(
      DomainNotFoundError,
    );
  });

  it('GET /api/areas/:id throws DomainNotFoundError for unknown id', async () => {
    const useCase = new GetAreaWithMembersUseCase(new FakeAreaRepository(), new FakeEmployeeRepository());
    await expect(useCase.execute({ id: 'missing' })).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});
