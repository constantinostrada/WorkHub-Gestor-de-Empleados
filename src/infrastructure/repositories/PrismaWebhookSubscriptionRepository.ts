import type { PrismaClient } from '@prisma/client';

import {
  WebhookSubscription,
  isWebhookEvent,
  type WebhookEvent,
} from '@/domain/entities/WebhookSubscription';
import type { IWebhookSubscriptionRepository } from '@/domain/repositories/IWebhookSubscriptionRepository';

interface WebhookSubscriptionRow {
  id: string;
  callbackUrl: string;
  events: string[];
  secret: string;
  createdAt: Date;
}

function rowToEntity(row: WebhookSubscriptionRow): WebhookSubscription {
  const events = row.events.filter(isWebhookEvent) as WebhookEvent[];
  return WebhookSubscription.fromPersistence({
    id: row.id,
    callbackUrl: row.callbackUrl,
    events,
    secret: row.secret,
    createdAt: row.createdAt,
  });
}

export class PrismaWebhookSubscriptionRepository implements IWebhookSubscriptionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(sub: WebhookSubscription): Promise<void> {
    await this.prisma.webhookSubscription.upsert({
      where: { id: sub.id },
      create: {
        id: sub.id,
        callbackUrl: sub.callbackUrl,
        events: sub.events,
        secret: sub.secret,
        createdAt: sub.createdAt,
      },
      update: {
        callbackUrl: sub.callbackUrl,
        events: sub.events,
        secret: sub.secret,
      },
    });
  }

  async findById(id: string): Promise<WebhookSubscription | null> {
    const row = await this.prisma.webhookSubscription.findUnique({ where: { id } });
    return row ? rowToEntity(row as WebhookSubscriptionRow) : null;
  }

  async findAll(): Promise<WebhookSubscription[]> {
    const rows = await this.prisma.webhookSubscription.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => rowToEntity(r as WebhookSubscriptionRow));
  }

  async findByEvent(event: WebhookEvent): Promise<WebhookSubscription[]> {
    const rows = await this.prisma.webhookSubscription.findMany({
      where: { events: { has: event } },
    });
    return rows.map((r) => rowToEntity(r as WebhookSubscriptionRow));
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.webhookSubscription.delete({ where: { id } });
      return true;
    } catch (err) {
      // Prisma throws P2025 when the record doesn't exist — treat as not-found.
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2025') {
        return false;
      }
      throw err;
    }
  }
}
