import type { WebhookEvent } from '@/domain/entities/WebhookSubscription';

export interface SubscribeWebhookDto {
  callbackUrl: string;
  events: string[];
}

export interface WebhookSubscriptionResponseDto {
  id: string;
  callback_url: string;
  events: WebhookEvent[];
  created_at: string;
  secret: string;
}

export interface PublicWebhookSubscriptionDto {
  id: string;
  callback_url: string;
  events: WebhookEvent[];
  created_at: string;
}

export interface ListWebhooksResponseDto {
  subscriptions: PublicWebhookSubscriptionDto[];
}
