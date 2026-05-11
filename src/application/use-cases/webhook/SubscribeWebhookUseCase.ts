/**
 * SubscribeWebhookUseCase — T17 AC-1..4
 *
 * Validates the events whitelist + callback_url scheme, generates a 32-byte
 * HMAC secret, and persists a new WebhookSubscription. Returns the full
 * subscription including the secret in plaintext — the secret is only ever
 * shown once (on creation) per T17 AC-2.
 */

import { randomBytes, randomUUID } from 'crypto';

import type {
  SubscribeWebhookDto,
  WebhookSubscriptionResponseDto,
} from '@/application/dtos/webhook.dto';
import {
  WEBHOOK_EVENTS,
  WebhookSubscription,
  isWebhookEvent,
  type WebhookEvent,
} from '@/domain/entities/WebhookSubscription';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import { InsecureWebhookUrlError } from '@/domain/errors/InsecureWebhookUrlError';
import { InvalidWebhookEventError } from '@/domain/errors/InvalidWebhookEventError';
import type { IWebhookSubscriptionRepository } from '@/domain/repositories/IWebhookSubscriptionRepository';

export interface SubscribeWebhookUseCaseOptions {
  nodeEnv?: string;
}

export class SubscribeWebhookUseCase {
  constructor(
    private readonly repo: IWebhookSubscriptionRepository,
    private readonly options: SubscribeWebhookUseCaseOptions = {},
  ) {}

  async execute(dto: SubscribeWebhookDto): Promise<WebhookSubscriptionResponseDto> {
    if (!dto.callbackUrl || typeof dto.callbackUrl !== 'string' || dto.callbackUrl.trim() === '') {
      throw new DomainValidationError('callback_url is required');
    }
    if (!Array.isArray(dto.events) || dto.events.length === 0) {
      throw new DomainValidationError('events must be a non-empty array');
    }

    for (const e of dto.events) {
      if (!isWebhookEvent(e)) {
        throw new InvalidWebhookEventError(String(e));
      }
    }
    const events = dto.events as WebhookEvent[];

    this.assertSecureUrl(dto.callbackUrl);

    const subscription = WebhookSubscription.create({
      id: randomUUID(),
      callbackUrl: dto.callbackUrl,
      events,
      secret: randomBytes(32).toString('hex'),
    });

    await this.repo.save(subscription);

    return {
      id: subscription.id,
      callback_url: subscription.callbackUrl,
      events: subscription.events,
      created_at: subscription.createdAt.toISOString(),
      secret: subscription.secret,
    };
  }

  /**
   * AC-4: callback_url must be HTTPS; in development NODE_ENV, HTTP is
   * accepted only for localhost / 127.0.0.1.
   */
  private assertSecureUrl(callbackUrl: string): void {
    let url: URL;
    try {
      url = new URL(callbackUrl);
    } catch {
      throw new DomainValidationError(`callback_url is not a valid URL: ${callbackUrl}`);
    }

    if (url.protocol === 'https:') return;

    if (url.protocol === 'http:') {
      const nodeEnv = this.options.nodeEnv ?? process.env['NODE_ENV'];
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (nodeEnv === 'development' && isLocalhost) return;
      throw new InsecureWebhookUrlError(callbackUrl);
    }

    throw new InsecureWebhookUrlError(callbackUrl);
  }

  static allowedEvents(): readonly WebhookEvent[] {
    return WEBHOOK_EVENTS;
  }
}
