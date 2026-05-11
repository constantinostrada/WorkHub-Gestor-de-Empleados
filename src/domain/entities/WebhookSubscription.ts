import { DomainValidationError } from '../errors/DomainValidationError';

export type WebhookEvent =
  | 'vacation.approved'
  | 'vacation.rejected'
  | 'vacation.cancelled'
  | 'employee.offboarded';

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  'vacation.approved',
  'vacation.rejected',
  'vacation.cancelled',
  'employee.offboarded',
] as const;

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

export interface WebhookSubscriptionProps {
  id: string;
  callbackUrl: string;
  events: WebhookEvent[];
  secret: string;
  createdAt: Date;
}

export interface WebhookSubscriptionCreateInput {
  id: string;
  callbackUrl: string;
  events: WebhookEvent[];
  secret: string;
  createdAt?: Date;
}

export class WebhookSubscription {
  private constructor(private readonly props: WebhookSubscriptionProps) {}

  static create(input: WebhookSubscriptionCreateInput): WebhookSubscription {
    if (!input.id || input.id.trim() === '') {
      throw new DomainValidationError('WebhookSubscription.id is required');
    }
    if (!input.callbackUrl || input.callbackUrl.trim() === '') {
      throw new DomainValidationError('WebhookSubscription.callbackUrl is required');
    }
    if (!Array.isArray(input.events) || input.events.length === 0) {
      throw new DomainValidationError('WebhookSubscription.events must be a non-empty array');
    }
    for (const e of input.events) {
      if (!isWebhookEvent(e)) {
        throw new DomainValidationError(`WebhookSubscription.events contains invalid event: ${String(e)}`);
      }
    }
    if (!input.secret || input.secret.trim() === '') {
      throw new DomainValidationError('WebhookSubscription.secret is required');
    }

    return new WebhookSubscription({
      id: input.id,
      callbackUrl: input.callbackUrl,
      events: [...input.events],
      secret: input.secret,
      createdAt: input.createdAt ?? new Date(),
    });
  }

  static fromPersistence(props: WebhookSubscriptionProps): WebhookSubscription {
    return new WebhookSubscription({
      ...props,
      events: [...props.events],
    });
  }

  get id(): string { return this.props.id; }
  get callbackUrl(): string { return this.props.callbackUrl; }
  get events(): WebhookEvent[] { return [...this.props.events]; }
  get secret(): string { return this.props.secret; }
  get createdAt(): Date { return this.props.createdAt; }

  listensTo(event: WebhookEvent): boolean {
    return this.props.events.includes(event);
  }
}
