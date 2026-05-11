/**
 * TimeEntryNotPendingError
 *
 * Thrown by TimeEntry.approve / TimeEntry.reject when the entry's current
 * status is not PENDING. Carries `currentStatus` so the HTTP layer can map
 * it to a 422 INVALID_STATE_TRANSITION response.
 */

import type { TimeEntryStatus } from '../entities/TimeEntry';

export class TimeEntryNotPendingError extends Error {
  readonly name = 'TimeEntryNotPendingError';
  readonly currentStatus: TimeEntryStatus;

  constructor(currentStatus: TimeEntryStatus) {
    super(`TimeEntry cannot transition from status ${currentStatus}.`);
    this.currentStatus = currentStatus;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
