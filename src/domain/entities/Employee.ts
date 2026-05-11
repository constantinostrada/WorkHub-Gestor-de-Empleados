/**
 * Employee — Aggregate Root
 *
 * Owns all invariants related to an employee's lifecycle.
 * Zero dependencies outside the domain layer.
 */

import type { Email } from '../value-objects/Email';
import type { Money } from '../value-objects/Money';
import { EmployeeStatus } from '../value-objects/EmployeeStatus';
import { DEFAULT_ROLE, isValidRole, type Role } from '../value-objects/Role';
import { DomainValidationError } from '../errors/DomainValidationError';
import { EmployeeOffboardedError } from '../errors/EmployeeOffboardedError';
import { SameAreaTransferError } from '../errors/SameAreaTransferError';

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
  areaId: string | null;
  role: Role;
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
    if (props.hireDate > new Date()) {
      throw new DomainValidationError('Hire date cannot be in the future.');
    }
    if (!isValidRole(props.role)) {
      throw new DomainValidationError(`Invalid employee role: "${String(props.role)}".`);
    }
  }

  static defaultRole(): Role {
    return DEFAULT_ROLE;
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
  get areaId(): string | null { return this.props.areaId; }
  get role(): Role { return this.props.role; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  // ── Computed properties ────────────────────────────────────────────────────

  get fullName(): string {
    return `${this.props.firstName} ${this.props.lastName}`;
  }

  get isActive(): boolean {
    return this.props.status === EmployeeStatus.ACTIVE;
  }

  /**
   * Whether this employee should be considered offboarded for write-side
   * operations (T18 transfer, future cascades). Project main has no
   * dedicated offboardedAt column yet (T13 unmerged); INACTIVE is the proxy.
   */
  get isOffboarded(): boolean {
    return this.props.status === EmployeeStatus.INACTIVE;
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

  transferToArea(areaId: string | null): Employee {
    if (this.isOffboarded) {
      throw new EmployeeOffboardedError(this.props.id);
    }
    if (areaId === this.props.areaId) {
      throw new SameAreaTransferError(this.props.areaId);
    }
    return Employee.create({
      ...this.props,
      areaId,
      updatedAt: new Date(),
    });
  }
}
