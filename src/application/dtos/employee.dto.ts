/**
 * Employee DTOs
 *
 * Input/output contracts for employee-related use cases.
 * Plain data objects — no domain types exposed.
 */

import type { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import type { Role } from '@/domain/value-objects/Role';

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
  role?: Role;
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
  role?: Role;
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
  includeOffboarded?: boolean;
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
  role: Role;
  offboarded: boolean;
  offboardedAt: string | null;
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
