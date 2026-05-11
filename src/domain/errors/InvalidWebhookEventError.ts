/**
 * InvalidWebhookEventError — thrown when a subscription request includes
 * an event name that is not in the WEBHOOK_EVENTS allowlist (T17 AC-3).
 */

export class InvalidWebhookEventError extends Error {
  readonly name = 'InvalidWebhookEventError';
  readonly invalidEvent: string;

  constructor(invalidEvent: string) {
    super(`"${invalidEvent}" is not a valid webhook event`);
    this.invalidEvent = invalidEvent;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
