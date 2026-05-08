/**
 * EmployeeStatus — Value Object (enum-like)
 *
 * Constrains the set of valid lifecycle states for an Employee.
 */

export enum EmployeeStatus {
  ACTIVE   = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ON_LEAVE = 'ON_LEAVE',
}

export function isValidEmployeeStatus(value: string): value is EmployeeStatus {
  return Object.values(EmployeeStatus).includes(value as EmployeeStatus);
}
