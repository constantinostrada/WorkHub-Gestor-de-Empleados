/**
 * Thrown when a mutation (e.g. TimeEntry creation) is attempted against
 * an Employee whose offboardedAt timestamp is set. Maps to HTTP 422 with
 * code EMPLOYEE_OFFBOARDED per T13 AC-3.
 */
export class EmployeeOffboardedError extends Error {
  readonly employeeId: string;
  readonly offboardedAt: Date;

  constructor(employeeId: string, offboardedAt: Date) {
    super(`Employee "${employeeId}" is offboarded (since ${offboardedAt.toISOString()}); the operation is not allowed.`);
    this.name = 'EmployeeOffboardedError';
    this.employeeId = employeeId;
    this.offboardedAt = offboardedAt;
  }
}
