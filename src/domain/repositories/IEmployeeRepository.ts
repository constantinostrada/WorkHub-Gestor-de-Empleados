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
  /**
   * When false (the default), employees with offboardedAt !== null are
   * excluded. When true, ALL employees are returned regardless of
   * offboarding status. See T13 AC-5 / AC-6.
   */
  includeOffboarded?: boolean;
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
  update(employee: Employee): Promise<void>;
  delete(id: string): Promise<void>;
  existsByEmail(email: string): Promise<boolean>;
}
