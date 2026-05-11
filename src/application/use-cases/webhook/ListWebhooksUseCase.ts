import type {
  ListWebhooksResponseDto,
  PublicWebhookSubscriptionDto,
} from '@/application/dtos/webhook.dto';
import type { IWebhookSubscriptionRepository } from '@/domain/repositories/IWebhookSubscriptionRepository';

export class ListWebhooksUseCase {
  constructor(private readonly repo: IWebhookSubscriptionRepository) {}

  async execute(): Promise<ListWebhooksResponseDto> {
    const subs = await this.repo.findAll();
    const subscriptions: PublicWebhookSubscriptionDto[] = subs.map((s) => ({
      id: s.id,
      callback_url: s.callbackUrl,
      events: s.events,
      created_at: s.createdAt.toISOString(),
    }));
    return { subscriptions };
  }
}
