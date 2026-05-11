import type { IWebhookSubscriptionRepository } from '@/domain/repositories/IWebhookSubscriptionRepository';

export interface DeleteWebhookDto {
  id: string;
}

export interface DeleteWebhookResult {
  deleted: boolean;
}

export class DeleteWebhookUseCase {
  constructor(private readonly repo: IWebhookSubscriptionRepository) {}

  async execute(dto: DeleteWebhookDto): Promise<DeleteWebhookResult> {
    const deleted = await this.repo.delete(dto.id);
    return { deleted };
  }
}
