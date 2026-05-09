/**
 * IEmployeeRepository — Repository Interface (Domain)
 *
 * Describes WHAT the application can do with Employee persistence.
 * HOW it is done lives exclusively in infrastructure/.
 *
 * No ORM types, no SQL, no third-party imports.
 */

import type { Employee } from '../entities/Employee';
import type { EmployeeStatus } from '../value-objects/EmployeeStatus';

export interface FindEmployeesFilter {
  areaId?: string;
  status?: EmployeeStatus;
  searchTerm?: string; // matches first/last name or email
}

export interface PaginationOptions {
  page: number;    // 1-indexed
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface IEmployeeRepository {
  findById(id: string): Promise<Employee | null>;
  findByEmail(email: string): Promise<Employee | null>;
  findAll(
    filter?: FindEmployeesFilter,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<Employee>>;
  save(employee: Employee): Promise<void>;
  /**
   * Persists a batch of employees atomically: if any insert fails, the whole
   * batch is rolled back. Implementations must wrap the writes in a single
   * transaction.
   */
  saveMany(employees: Employee[]): Promise<void>;
  update(employee: Employee): Promise<void>;
  delete(id: string): Promise<void>;
  existsByEmail(email: string): Promise<boolean>;
}
