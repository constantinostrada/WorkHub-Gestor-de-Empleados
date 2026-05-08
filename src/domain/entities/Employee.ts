/**
 * Employee — Aggregate Root
 *
 * Owns all invariants related to an employee's lifecycle.
 * Zero dependencies outside the domain layer.
 */

import type { Email } from '../value-objects/Email';
import type { Money } from '../value-objects/Money';
import { EmployeeStatus } from '../value-objects/EmployeeStatus';
import { DomainValidationError } from '../errors/DomainValidationError';

export interface EmployeeProps {
  id: string;
  firstName: string;
  lastName: string;
  email: Email;
  phone: string | null;
  position: string;
  salary: Money;
  status: EmployeeStatus;
  hireDate: Date;
  departmentId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Employee {
  private readonly props: EmployeeProps;

  private constructor(props: EmployeeProps) {
    this.props = props;
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static create(props: EmployeeProps): Employee {
    Employee.validate(props);
    return new Employee(props);
  }

  private static validate(props: EmployeeProps): void {
    if (!props.firstName.trim()) {
      throw new DomainValidationError('Employee first name cannot be empty.');
    }
    if (!props.lastName.trim()) {
      throw new DomainValidationError('Employee last name cannot be empty.');
    }
    if (!props.position.trim()) {
      throw new DomainValidationError('Employee position cannot be empty.');
    }
    if (!props.departmentId.trim()) {
      throw new DomainValidationError('Employee must belong to a department.');
    }
    if (props.hireDate > new Date()) {
      throw new DomainValidationError('Hire date cannot be in the future.');
    }
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get id(): string { return this.props.id; }
  get firstName(): string { return this.props.firstName; }
  get lastName(): string { return this.props.lastName; }
  get email(): Email { return this.props.email; }
  get phone(): string | null { return this.props.phone; }
  get position(): string { return this.props.position; }
  get salary(): Money { return this.props.salary; }
  get status(): EmployeeStatus { return this.props.status; }
  get hireDate(): Date { return this.props.hireDate; }
  get departmentId(): string { return this.props.departmentId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  // ── Computed properties ────────────────────────────────────────────────────

  get fullName(): string {
    return `${this.props.firstName} ${this.props.lastName}`;
  }

  get isActive(): boolean {
    return this.props.status === EmployeeStatus.ACTIVE;
  }

  // ── Domain behaviour ───────────────────────────────────────────────────────

  deactivate(): Employee {
    if (this.props.status === EmployeeStatus.INACTIVE) {
      throw new DomainValidationError('Employee is already inactive.');
    }
    return Employee.create({
      ...this.props,
      status: EmployeeStatus.INACTIVE,
      updatedAt: new Date(),
    });
  }

  activate(): Employee {
    if (this.props.status === EmployeeStatus.ACTIVE) {
      throw new DomainValidationError('Employee is already active.');
    }
    return Employee.create({
      ...this.props,
      status: EmployeeStatus.ACTIVE,
      updatedAt: new Date(),
    });
  }

  updateSalary(newSalary: Money): Employee {
    if (newSalary.amount <= 0) {
      throw new DomainValidationError('Salary must be a positive amount.');
    }
    return Employee.create({
      ...this.props,
      salary: newSalary,
      updatedAt: new Date(),
    });
  }

  transferToDepartment(departmentId: string): Employee {
    if (!departmentId.trim()) {
      throw new DomainValidationError('Target department ID cannot be empty.');
    }
    if (departmentId === this.props.departmentId) {
      throw new DomainValidationError('Employee is already in this department.');
    }
    return Employee.create({
      ...this.props,
      departmentId,
      updatedAt: new Date(),
    });
  }
}
