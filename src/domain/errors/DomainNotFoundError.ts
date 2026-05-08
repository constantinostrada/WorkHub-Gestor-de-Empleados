/**
 * DomainNotFoundError
 *
 * Thrown when an aggregate or entity cannot be located by its identifier.
 * Infrastructure / interfaces layers map this to a 404 response.
 */

export class DomainNotFoundError extends Error {
  readonly name = 'DomainNotFoundError';
  readonly resourceType: string;
  readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} with id "${resourceId}" was not found.`);
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
