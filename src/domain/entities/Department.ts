/**
 * Department — Entity
 *
 * Represents an organisational unit within the company.
 */

import { DomainValidationError } from '../errors/DomainValidationError';

export interface DepartmentProps {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Department {
  private readonly props: DepartmentProps;

  private constructor(props: DepartmentProps) {
    this.props = props;
  }

  static create(props: DepartmentProps): Department {
    Department.validate(props);
    return new Department(props);
  }

  private static validate(props: DepartmentProps): void {
    if (!props.name.trim()) {
      throw new DomainValidationError('Department name cannot be empty.');
    }
    if (props.name.length > 100) {
      throw new DomainValidationError('Department name must be 100 characters or fewer.');
    }
  }

  get id(): string { return this.props.id; }
  get name(): string { return this.props.name; }
  get description(): string | null { return this.props.description; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  rename(newName: string): Department {
    if (!newName.trim()) {
      throw new DomainValidationError('New department name cannot be empty.');
    }
    return Department.create({ ...this.props, name: newName, updatedAt: new Date() });
  }
}
