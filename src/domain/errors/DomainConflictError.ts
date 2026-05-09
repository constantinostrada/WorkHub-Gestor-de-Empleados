/**
 * DomainConflictError
 *
 * Thrown when an operation would violate a uniqueness or state-conflict invariant
 * (e.g. inserting a duplicate, creating something that already exists).
 * Infrastructure / interfaces layers map this to a 409 Conflict response.
 */

export class DomainConflictError extends Error {
  readonly name = 'DomainConflictError';
  readonly resourceType: string;

  constructor(resourceType: string, message: string) {
    super(message);
    this.resourceType = resourceType;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
