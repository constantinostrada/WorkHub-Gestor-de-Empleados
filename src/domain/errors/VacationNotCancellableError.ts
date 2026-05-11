/**
 * VacationNotCancellableError
 *
 * Thrown by Vacation.cancel(now) when the current status is not a cancellable
 * one (i.e. CANCELLED or REJECTED). Carries the offending `currentStatus` so
 * the HTTP layer can map it to a 422 with body
 * { error: "vacation_not_cancellable", current_status: <string> }.
 */

import type { VacationStatus } from '../entities/Vacation';

export class VacationNotCancellableError extends Error {
  readonly name = 'VacationNotCancellableError';
  readonly currentStatus: VacationStatus;

  constructor(currentStatus: VacationStatus) {
    super(`Vacation cannot be cancelled in status ${currentStatus}.`);
    this.currentStatus = currentStatus;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
