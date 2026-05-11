/**
 * Role — Value Object (enum-like)
 *
 * Constrains the set of valid permission roles attached to an Employee.
 * Used by the withRole HTTP middleware (interfaces layer) to gate access
 * to mutation endpoints.
 */

export const ROLES = ['admin', 'manager', 'employee'] as const;

export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = 'employee';

export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
