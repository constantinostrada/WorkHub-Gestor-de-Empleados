/**
 * DomainValidationError
 *
 * Thrown when a business invariant is violated inside the domain layer.
 * Infrastructure / interfaces layers can catch this to return 400-type responses.
 */

export class DomainValidationError extends Error {
  readonly name = 'DomainValidationError';

  constructor(message: string) {
    super(message);
    // Restore prototype chain for `instanceof` checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
