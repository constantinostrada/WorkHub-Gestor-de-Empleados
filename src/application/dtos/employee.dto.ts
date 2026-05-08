/**
 * Employee DTOs
 *
 * Input/output contracts for employee-related use cases.
 * Plain data objects — no domain types exposed.
 */

import type { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';

// ── Input DTOs ─────────────────────────────────────────────────────────────

export interface CreateEmployeeDto {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  position: string;
  salary: number;
  currency?: string;
  hireDate: string; // ISO-8601 date string
  areaId?: string | null;
}

export interface UpdateEmployeeDto {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  position?: string;
  salary?: number;
  currency?: string;
  status?: EmployeeStatus;
  areaId?: string | null;
}

export interface GetEmployeeDto {
  id: string;
}

export interface ListEmployeesDto {
  areaId?: string;
  status?: EmployeeStatus;
  searchTerm?: string;
  page?: number;
  pageSize?: number;
}

export interface DeleteEmployeeDto {
  id: string;
}

// ── Output DTOs ───────────────────────────────────────────────────────────

export interface EmployeeResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  position: string;
  salary: number;
  currency: string;
  status: EmployeeStatus;
  hireDate: string;
  areaId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedEmployeesResponseDto {
  items: EmployeeResponseDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
