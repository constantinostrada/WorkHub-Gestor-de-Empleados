import type { WebhookEvent, WebhookSubscription } from '../entities/WebhookSubscription';

export interface IWebhookSubscriptionRepository {
  save(sub: WebhookSubscription): Promise<void>;
  findById(id: string): Promise<WebhookSubscription | null>;
  findAll(): Promise<WebhookSubscription[]>;
  findByEvent(event: WebhookEvent): Promise<WebhookSubscription[]>;
  delete(id: string): Promise<boolean>;
}
