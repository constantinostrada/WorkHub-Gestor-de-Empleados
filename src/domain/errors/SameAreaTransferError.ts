/**
 * SameAreaTransferError
 *
 * Thrown when an Employee transfer is requested but the target area matches
 * the employee's current areaId. Maps to HTTP 422 SAME_AREA at the interfaces
 * layer.
 */

export class SameAreaTransferError extends Error {
  readonly name = 'SameAreaTransferError';
  readonly areaId: string | null;

  constructor(areaId: string | null) {
    super(`Employee is already in area "${areaId ?? '(none)'}".`);
    this.areaId = areaId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
