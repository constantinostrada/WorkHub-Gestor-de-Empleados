/**
 * CreateEmployeeUseCase — Unit Test
 *
 * Uses in-memory fakes that implement the repository interfaces.
 * No real DB required.
 */

import { CreateEmployeeUseCase } from '../use-cases/employee/CreateEmployeeUseCase';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import type { IDepartmentRepository } from '@/domain/repositories/IDepartmentRepository';
import type { Employee } from '@/domain/entities/Employee';
import type { Department } from '@/domain/entities/Department';
import type {
  FindEmployeesFilter,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';

// ── In-memory fakes ─────────────────────────────────────────────────────────

class FakeEmployeeRepository implements IEmployeeRepository {
  private store: Map<string, Employee> = new Map();

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
    return { items, total: items.length, page: pagination?.page ?? 1, pageSize: pagination?.pageSize ?? 20, totalPages: 1 };
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

class FakeDepartmentRepository implements IDepartmentRepository {
  private existing: boolean;

  constructor(departmentExists = true) {
    this.existing = departmentExists;
  }

  async findById(_id: string): Promise<Department | null> { return null; }
  async findByName(_name: string): Promise<Department | null> { return null; }
  async findAll(): Promise<Department[]> { return []; }
  async save(_d: Department): Promise<void> { /* no-op */ }
  async update(_d: Department): Promise<void> { /* no-op */ }
  async delete(_id: string): Promise<void> { /* no-op */ }
  async existsById(_id: string): Promise<boolean> { return this.existing; }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CreateEmployeeUseCase', () => {
  const validDto = {
    firstName:    'Ana',
    lastName:     'García',
    email:        'ana@workhub.com',
    position:     'Engineer',
    salary:       3000,
    hireDate:     '2022-01-15',
    departmentId: '00000000-0000-0000-0000-000000000001',
  };

  it('creates an employee successfully', async () => {
    const useCase = new CreateEmployeeUseCase(
      new FakeEmployeeRepository(),
      new FakeDepartmentRepository(true),
    );

    const result = await useCase.execute(validDto);

    expect(result.firstName).toBe('Ana');
    expect(result.fullName).toBe('Ana García');
    expect(result.email).toBe('ana@workhub.com');
    expect(result.status).toBe('ACTIVE');
  });

  it('throws when department does not exist', async () => {
    const useCase = new CreateEmployeeUseCase(
      new FakeEmployeeRepository(),
      new FakeDepartmentRepository(false),
    );

    await expect(useCase.execute(validDto)).rejects.toThrow(DomainValidationError);
  });

  it('throws when e-mail is already taken', async () => {
    const employeeRepo = new FakeEmployeeRepository();

    const useCase = new CreateEmployeeUseCase(
      employeeRepo,
      new FakeDepartmentRepository(true),
    );

    // First creation succeeds
    await useCase.execute(validDto);

    // Second creation with same email should fail
    await expect(useCase.execute(validDto)).rejects.toThrow(DomainValidationError);
  });
});
