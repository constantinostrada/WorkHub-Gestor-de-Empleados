/**
 * Employee Input Validation Schemas
 *
 * Uses Zod for schema validation.
 * Only structural/format validation lives here.
 * Business rules (e.g. "salary must be fair market value") live in domain.
 */

import { z } from 'zod';

import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { ROLES } from '@/domain/value-objects/Role';

export const createEmployeeSchema = z.object({
  firstName:    z.string().min(1).max(100),
  lastName:     z.string().min(1).max(100),
  email:        z.string().email(),
  phone:        z.string().max(30).optional(),
  position:     z.string().min(1).max(150),
  salary:       z.number().positive(),
  currency:     z.string().length(3).optional(),
  hireDate:     z.string().datetime({ offset: true }).or(z.string().date()),
  areaId:       z.string().uuid().nullable().optional(),
});

export const updateEmployeeSchema = z.object({
  firstName:    z.string().min(1).max(100).optional(),
  lastName:     z.string().min(1).max(100).optional(),
  phone:        z.string().max(30).nullable().optional(),
  position:     z.string().min(1).max(150).optional(),
  salary:       z.number().positive().optional(),
  currency:     z.string().length(3).optional(),
  status:       z.nativeEnum(EmployeeStatus).optional(),
  areaId:       z.string().uuid().nullable().optional(),
});

export const listEmployeesSchema = z.object({
  areaId:     z.string().uuid().optional(),
  status:     z.nativeEnum(EmployeeStatus).optional(),
  searchTerm: z.string().max(100).optional(),
  page:       z.coerce.number().int().positive().default(1),
  pageSize:   z.coerce.number().int().positive().max(100).default(20),
});

// ── Public API surface (snake_case, simplified per AC) ──────────────────────
//
// AC-1: POST /api/employees expects `{ name, email, role }` — no area initially.
// AC-3: PUT  /api/employees/:id expects `{ area_id }`   (null clears area).
// AC-5: GET  /api/employees accepts optional `?area_id=X`.
//
// Translation to the rich domain DTOs happens in the route handler.

export const apiCreateEmployeeSchema = z.object({
  name:  z.string().min(1).max(200),
  email: z.string().email(),
  role:  z.enum(ROLES),
});

export const apiAssignAreaSchema = z.object({
  area_id: z.string().uuid().nullable(),
});

export const apiListEmployeesSchema = z.object({
  area_id: z.string().uuid().optional(),
});
