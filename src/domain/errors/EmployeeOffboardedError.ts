/**
 * EmployeeOffboardedError
 *
 * Thrown when an operation requires an active employee but the target has
 * been offboarded. Maps to HTTP 422 EMPLOYEE_OFFBOARDED at the interfaces
 * layer. NOTE: project has no dedicated offboardedAt column on `main`;
 * EmployeeStatus.INACTIVE is the current proxy for "offboarded".
 */

export class EmployeeOffboardedError extends Error {
  readonly name = 'EmployeeOffboardedError';
  readonly employeeId: string;

  constructor(employeeId: string) {
    super(`Employee "${employeeId}" is offboarded.`);
    this.employeeId = employeeId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
