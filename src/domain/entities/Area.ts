/**
 * Area — Entity
 *
 * Represents an organisational unit within the company.
 * May optionally reference an Employee as its manager.
 */

import { DomainValidationError } from '../errors/DomainValidationError';

export interface AreaProps {
  id: string;
  name: string;
  description: string | null;
  managerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Area {
  private readonly props: AreaProps;

  private constructor(props: AreaProps) {
    this.props = props;
  }

  static create(props: AreaProps): Area {
    Area.validate(props);
    return new Area(props);
  }

  private static validate(props: AreaProps): void {
    if (!props.name.trim()) {
      throw new DomainValidationError('Area name cannot be empty.');
    }
    if (props.name.length > 100) {
      throw new DomainValidationError('Area name must be 100 characters or fewer.');
    }
  }

  get id(): string { return this.props.id; }
  get name(): string { return this.props.name; }
  get description(): string | null { return this.props.description; }
  get managerId(): string | null { return this.props.managerId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  rename(newName: string): Area {
    if (!newName.trim()) {
      throw new DomainValidationError('New area name cannot be empty.');
    }
    return Area.create({ ...this.props, name: newName, updatedAt: new Date() });
  }

  assignManager(managerId: string | null): Area {
    return Area.create({ ...this.props, managerId, updatedAt: new Date() });
  }
}
