/**
 * InsecureWebhookUrlError — thrown when a subscription's callback_url
 * is not HTTPS (and not a localhost dev exception). T17 AC-4.
 */

export class InsecureWebhookUrlError extends Error {
  readonly name = 'InsecureWebhookUrlError';
  readonly url: string;

  constructor(url: string) {
    super(`Webhook callback_url must be HTTPS: ${url}`);
    this.url = url;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
