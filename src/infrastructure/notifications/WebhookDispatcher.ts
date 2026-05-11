/**
 * WebhookDispatcher — Outbound webhook adapter (T17 AC-7..9).
 *
 * Listens on every NotificationEvent. For each event:
 *   1. Looks up subscriptions whose `events` list contains the event_type.
 *   2. Builds the AC-7 body { event, resource_type, resource_id, payload, timestamp }.
 *   3. Signs JSON.stringify(body) with HMAC-SHA256 using the subscription's
 *      secret, formats as `sha256=<hex>` in header X-Chiron-Signature.
 *   4. POSTs with a 5 s timeout. On timeout, network error, or HTTP 4xx/5xx,
 *      retries with backoff (1, 2, 4, 8 s) up to 4 attempts total.
 *   5. After the final attempt resolves (success or exhausted), records an
 *      audit row: action='webhook.delivered' on success or
 *      'webhook.failed' after the 4th failed attempt.
 *
 * Audit logging goes through the application LogAuditEntryUseCase so this
 * adapter never touches the audit repository directly.
 */

import { createHmac } from 'crypto';

import type { LogAuditEntryUseCase } from '@/application/use-cases/audit/LogAuditEntryUseCase';
import type {
  INotificationDispatcher,
  NotificationEvent,
} from '@/application/ports/INotificationDispatcher';
import type { WebhookEvent, WebhookSubscription } from '@/domain/entities/WebhookSubscription';
import type { IWebhookSubscriptionRepository } from '@/domain/repositories/IWebhookSubscriptionRepository';

export interface WebhookHttpResponse {
  ok: boolean;
  status: number;
}

export type WebhookHttpClient = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<WebhookHttpResponse>;

export type SleepFn = (ms: number) => Promise<void>;

export interface WebhookDispatcherOptions {
  http?: WebhookHttpClient;
  sleep?: SleepFn;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: readonly number[];
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BACKOFF_MS = [1000, 2000, 4000, 8000] as const;

export interface WebhookBody {
  event: WebhookEvent;
  resource_type: 'vacation' | 'employee';
  resource_id: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class WebhookDispatcher implements INotificationDispatcher {
  private readonly http: WebhookHttpClient;
  private readonly sleep: SleepFn;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: readonly number[];
  private readonly now: () => Date;

  constructor(
    private readonly subRepo: IWebhookSubscriptionRepository,
    private readonly logAuditEntry: LogAuditEntryUseCase,
    opts: WebhookDispatcherOptions = {},
  ) {
    this.http = opts.http ?? defaultHttpClient;
    this.sleep = opts.sleep ?? defaultSleep;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.now = opts.now ?? (() => new Date());
  }

  async dispatch(event: NotificationEvent): Promise<void> {
    // Only the events whitelisted for outbound webhooks fan out here. Other
    // NotificationEvent variants (e.g. 'vacation.created') are skipped.
    if (!isWebhookableEvent(event.event_type)) {
      return;
    }

    const subs = await this.subRepo.findByEvent(event.event_type);
    if (subs.length === 0) {
      return;
    }

    const body = buildBody(event, this.now());
    const payload = JSON.stringify(body);

    await Promise.all(
      subs.map((sub) => this.deliverToSubscription(sub, body, payload)),
    );
  }

  private async deliverToSubscription(
    sub: WebhookSubscription,
    body: WebhookBody,
    payload: string,
  ): Promise<void> {
    const signature = `sha256=${createHmac('sha256', sub.secret).update(payload).digest('hex')}`;
    let lastError: string | null = null;
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.http(sub.callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Chiron-Signature': signature,
          },
          body: payload,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok && res.status >= 200 && res.status < 300) {
          await this.audit('webhook.delivered', sub.id, body, attempt, res.status, null);
          return;
        }

        lastStatus = res.status;
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        clearTimeout(timer);
        lastError = err instanceof Error ? err.message : String(err);
        lastStatus = null;
      }

      if (attempt < this.maxAttempts) {
        const wait = this.backoffMs[attempt - 1] ?? 0;
        await this.sleep(wait);
      }
    }

    await this.audit('webhook.failed', sub.id, body, this.maxAttempts, lastStatus, lastError);
  }

  private async audit(
    action: 'webhook.delivered' | 'webhook.failed',
    subscriptionId: string,
    body: WebhookBody,
    attempts: number,
    statusCode: number | null,
    lastError: string | null,
  ): Promise<void> {
    try {
      await this.logAuditEntry.execute({
        actorId: null,
        action,
        resourceType: 'webhook',
        resourceId: subscriptionId,
        detailsJson: {
          event: body.event,
          resource_type: body.resource_type,
          resource_id: body.resource_id,
          attempts,
          ...(statusCode !== null ? { status_code: statusCode } : {}),
          ...(lastError !== null ? { last_error: lastError } : {}),
        },
      });
    } catch (err) {
      console.error('[webhook] failed to record audit entry', err);
    }
  }
}

function isWebhookableEvent(
  eventType: NotificationEvent['event_type'],
): eventType is WebhookEvent {
  return (
    eventType === 'vacation.approved' ||
    eventType === 'vacation.rejected' ||
    eventType === 'vacation.cancelled' ||
    eventType === 'employee.offboarded'
  );
}

function buildBody(event: NotificationEvent, timestamp: Date): WebhookBody {
  switch (event.event_type) {
    case 'vacation.approved': {
      const { event_type: _e, ...payload } = event;
      return {
        event: 'vacation.approved',
        resource_type: 'vacation',
        resource_id: event.vacation_id,
        payload: payload as unknown as Record<string, unknown>,
        timestamp: timestamp.toISOString(),
      };
    }
    case 'vacation.rejected': {
      const { event_type: _e, ...payload } = event;
      return {
        event: 'vacation.rejected',
        resource_type: 'vacation',
        resource_id: event.vacation_id,
        payload: payload as unknown as Record<string, unknown>,
        timestamp: timestamp.toISOString(),
      };
    }
    case 'vacation.cancelled': {
      const { event_type: _e, ...payload } = event;
      return {
        event: 'vacation.cancelled',
        resource_type: 'vacation',
        resource_id: event.vacation_id,
        payload: payload as unknown as Record<string, unknown>,
        timestamp: timestamp.toISOString(),
      };
    }
    case 'employee.offboarded': {
      const { event_type: _e, ...payload } = event;
      return {
        event: 'employee.offboarded',
        resource_type: 'employee',
        resource_id: event.employee_id,
        payload: payload as unknown as Record<string, unknown>,
        timestamp: timestamp.toISOString(),
      };
    }
    default:
      // vacation.created and any future non-webhook events should be filtered
      // out earlier by isWebhookableEvent. This branch is a defensive default.
      throw new Error(`Cannot build webhook body for non-webhook event ${(event as { event_type: string }).event_type}`);
  }
}

const defaultHttpClient: WebhookHttpClient = async (url, init) => {
  const res = await fetch(url, init);
  return { ok: res.ok, status: res.status };
};

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
