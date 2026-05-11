/**
 * Thrown when an offboarding action is attempted on an Employee whose
 * offboardedAt timestamp is already set. Maps to HTTP 409 with code
 * EMPLOYEE_ALREADY_OFFBOARDED per T13 AC-9.
 */
export class EmployeeAlreadyOffboardedError extends Error {
  readonly employeeId: string;
  readonly offboardedAt: Date;

  constructor(employeeId: string, offboardedAt: Date) {
    super(`Employee "${employeeId}" is already offboarded at ${offboardedAt.toISOString()}.`);
    this.name = 'EmployeeAlreadyOffboardedError';
    this.employeeId = employeeId;
    this.offboardedAt = offboardedAt;
  }
}
