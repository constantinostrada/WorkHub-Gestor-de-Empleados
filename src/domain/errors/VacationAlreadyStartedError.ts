/**
 * VacationAlreadyStartedError
 *
 * Thrown by Vacation.cancel(now) when the vacation start_date is at or before
 * `now` — cancellation is only allowed strictly before the vacation begins.
 * Carries the structured `startDate` so the HTTP layer can map it to a 422
 * with body { error: "vacation_already_started", start_date: ISO8601 }.
 */

export class VacationAlreadyStartedError extends Error {
  readonly name = 'VacationAlreadyStartedError';
  readonly startDate: Date;

  constructor(startDate: Date) {
    super(`Vacation has already started on ${startDate.toISOString()}.`);
    this.startDate = startDate;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
