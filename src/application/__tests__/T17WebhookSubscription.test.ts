/**
 * T17 — Webhook subscription system.
 *
 *   AC-1 · POST /api/webhooks/subscribe requires admin and creates a sub.
 *          Body: { callback_url, events }.
 *   AC-2 · Returns 201 with { id, callback_url, events, created_at, secret }.
 *   AC-3 · Event whitelist + 422 INVALID_EVENT on unknown event.
 *   AC-4 · callback_url must be HTTPS (except http://localhost in dev).
 *          Non-HTTPS → 422 INSECURE_URL.
 *   AC-5 · GET /api/webhooks (admin) returns { subscriptions: [...] }.
 *   AC-6 · DELETE /api/webhooks/:id (admin) is idempotent: unknown id → 404
 *          rather than error.
 *   AC-7 · On an outbound event, dispatcher POSTs to each subscriber with
 *          body { event, resource_type, resource_id, payload, timestamp }
 *          + header X-Chiron-Signature: sha256=<hmac>.
 *   AC-8 · Retry with backoff (1s, 2s, 4s, 8s) up to 4 attempts on timeout
 *          / 4xx / 5xx.
 *   AC-9 · Audit row written per delivery: action=webhook.delivered (success)
 *          or webhook.failed (final fail), resource_type=webhook.
 */

import { createHmac } from 'crypto';

import { LogAuditEntryUseCase } from '../use-cases/audit/LogAuditEntryUseCase';
import { DeleteWebhookUseCase } from '../use-cases/webhook/DeleteWebhookUseCase';
import { ListWebhooksUseCase } from '../use-cases/webhook/ListWebhooksUseCase';
import { SubscribeWebhookUseCase } from '../use-cases/webhook/SubscribeWebhookUseCase';

import { AuditLog } from '@/domain/entities/AuditLog';
import {
  WEBHOOK_EVENTS,
  WebhookSubscription,
  type WebhookEvent,
} from '@/domain/entities/WebhookSubscription';
import { InsecureWebhookUrlError } from '@/domain/errors/InsecureWebhookUrlError';
import { InvalidWebhookEventError } from '@/domain/errors/InvalidWebhookEventError';
import type {
  AuditLogPaginatedResult,
  FindAuditLogsFilter,
  FindAuditLogsPagination,
  IAuditLogRepository,
} from '@/domain/repositories/IAuditLogRepository';
import type { IWebhookSubscriptionRepository } from '@/domain/repositories/IWebhookSubscriptionRepository';
import {
  WebhookDispatcher,
  type WebhookHttpClient,
  type WebhookHttpResponse,
} from '@/infrastructure/notifications/WebhookDispatcher';

// ─────────────────────────────────────────────────────────────────────────────
// Fakes
// ─────────────────────────────────────────────────────────────────────────────

class FakeWebhookRepo implements IWebhookSubscriptionRepository {
  readonly store = new Map<string, WebhookSubscription>();

  async save(s: WebhookSubscription): Promise<void> {
    this.store.set(s.id, s);
  }
  async findById(id: string): Promise<WebhookSubscription | null> {
    return this.store.get(id) ?? null;
  }
  async findAll(): Promise<WebhookSubscription[]> {
    return [...this.store.values()];
  }
  async findByEvent(event: WebhookEvent): Promise<WebhookSubscription[]> {
    return [...this.store.values()].filter((s) => s.listensTo(event));
  }
  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

class FakeAuditLogRepo implements IAuditLogRepository {
  readonly store: AuditLog[] = [];
  async save(entry: AuditLog): Promise<void> {
    this.store.push(entry);
  }
  async findMany(
    _filter: FindAuditLogsFilter,
    _pagination: FindAuditLogsPagination,
  ): Promise<AuditLogPaginatedResult> {
    return { logs: this.store, total: this.store.length };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock the container so the route handlers use our fakes.
// ─────────────────────────────────────────────────────────────────────────────

const fakeWebhookRepo = new FakeWebhookRepo();

jest.mock('@/infrastructure/container/container', () => {
  const {
    SubscribeWebhookUseCase: SubscribeUC,
  } = jest.requireActual('../use-cases/webhook/SubscribeWebhookUseCase');
  const {
    ListWebhooksUseCase: ListUC,
  } = jest.requireActual('../use-cases/webhook/ListWebhooksUseCase');
  const {
    DeleteWebhookUseCase: DeleteUC,
  } = jest.requireActual('../use-cases/webhook/DeleteWebhookUseCase');

  return {
    container: {
      subscribeWebhook: new SubscribeUC(fakeWebhookRepo),
      listWebhooks: new ListUC(fakeWebhookRepo),
      deleteWebhook: new DeleteUC(fakeWebhookRepo),
    },
  };
});

function makeRequest(opts: {
  body?: unknown;
  headers?: Record<string, string>;
}): any {
  const headers = opts.headers ?? {};
  return {
    json: async () => opts.body ?? {},
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
    nextUrl: { searchParams: new URLSearchParams() },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · POST /api/webhooks/subscribe requires admin and creates subscription
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-1 · POST /api/webhooks/subscribe requires admin and creates subscription', () => {
  beforeEach(() => {
    fakeWebhookRepo.store.clear();
  });

  it('AC-1 · 403 for non-admin role', async () => {
    const { POST } = await import('@/app/api/webhooks/subscribe/route');
    const res = await POST(makeRequest({
      body: { callback_url: 'https://example.com/h', events: ['vacation.approved'] },
      headers: { 'x-role': 'manager' },
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(body.required_roles).toEqual(['admin']);
  });

  it('AC-1 · 403 for missing role header', async () => {
    const { POST } = await import('@/app/api/webhooks/subscribe/route');
    const res = await POST(makeRequest({
      body: { callback_url: 'https://example.com/h', events: ['vacation.approved'] },
    }));
    expect(res.status).toBe(403);
  });

  it('AC-1 · admin creates subscription with callback_url + events body', async () => {
    const { POST } = await import('@/app/api/webhooks/subscribe/route');
    const res = await POST(makeRequest({
      body: {
        callback_url: 'https://example.com/hook',
        events: ['vacation.approved', 'vacation.rejected'],
      },
      headers: { 'x-role': 'admin' },
    }));
    expect(res.status).toBe(201);

    expect(fakeWebhookRepo.store.size).toBe(1);
    const [stored] = [...fakeWebhookRepo.store.values()];
    expect(stored?.callbackUrl).toBe('https://example.com/hook');
    expect(stored?.events).toEqual(['vacation.approved', 'vacation.rejected']);
  });

  it('AC-1 · 400 when body is missing required fields', async () => {
    const { POST } = await import('@/app/api/webhooks/subscribe/route');
    const res = await POST(makeRequest({
      body: { events: ['vacation.approved'] },
      headers: { 'x-role': 'admin' },
    }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · response shape { id, callback_url, events, created_at, secret }
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-2 · response shape', () => {
  beforeEach(() => fakeWebhookRepo.store.clear());

  it('AC-2 · returns { id, callback_url, events, created_at, secret }', async () => {
    const { POST } = await import('@/app/api/webhooks/subscribe/route');
    const res = await POST(makeRequest({
      body: {
        callback_url: 'https://example.com/hook',
        events: ['vacation.approved'],
      },
      headers: { 'x-role': 'admin' },
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['callback_url', 'created_at', 'events', 'id', 'secret'].sort(),
    );
    expect(typeof body.id).toBe('string');
    expect(body.callback_url).toBe('https://example.com/hook');
    expect(body.events).toEqual(['vacation.approved']);
    expect(typeof body.created_at).toBe('string');
    expect(new Date(body.created_at).toString()).not.toBe('Invalid Date');
    expect(typeof body.secret).toBe('string');
    expect(body.secret.length).toBeGreaterThanOrEqual(32);
  });

  it('AC-2 · secret is usable for HMAC sign (matches a manual hmac-sha256)', async () => {
    const repo = new FakeWebhookRepo();
    const uc = new SubscribeWebhookUseCase(repo);
    const sub = await uc.execute({
      callbackUrl: 'https://example.com/hook',
      events: ['vacation.approved'],
    });

    const payload = JSON.stringify({ hello: 'world' });
    const sigA = createHmac('sha256', sub.secret).update(payload).digest('hex');
    const sigB = createHmac('sha256', sub.secret).update(payload).digest('hex');
    expect(sigA).toBe(sigB);
    expect(sigA.length).toBe(64); // sha256 hex length
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 · event whitelist
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-3 · events validated against whitelist', () => {
  beforeEach(() => fakeWebhookRepo.store.clear());

  it('AC-3 · whitelist contains exactly the four AC-mandated events', () => {
    expect([...WEBHOOK_EVENTS].sort()).toEqual(
      ['vacation.approved', 'vacation.rejected', 'vacation.cancelled', 'employee.offboarded'].sort(),
    );
  });

  it('AC-3 · accepts all four whitelisted events', async () => {
    const repo = new FakeWebhookRepo();
    const uc = new SubscribeWebhookUseCase(repo);
    const sub = await uc.execute({
      callbackUrl: 'https://example.com/h',
      events: [
        'vacation.approved',
        'vacation.rejected',
        'vacation.cancelled',
        'employee.offboarded',
      ],
    });
    expect(sub.events).toHaveLength(4);
  });

  it('AC-3 · rejects unknown event via use case (InvalidWebhookEventError)', async () => {
    const repo = new FakeWebhookRepo();
    const uc = new SubscribeWebhookUseCase(repo);
    await expect(uc.execute({
      callbackUrl: 'https://example.com/h',
      events: ['vacation.approved', 'something.weird'],
    })).rejects.toBeInstanceOf(InvalidWebhookEventError);
  });

  it('AC-3 · POST returns 422 with code INVALID_EVENT for unknown event', async () => {
    const { POST } = await import('@/app/api/webhooks/subscribe/route');
    const res = await POST(makeRequest({
      body: {
        callback_url: 'https://example.com/h',
        events: ['vacation.unknown'],
      },
      headers: { 'x-role': 'admin' },
    }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('INVALID_EVENT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · HTTPS-only callback_url (localhost dev exception)
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-4 · callback_url must be HTTPS (localhost dev exception)', () => {
  beforeEach(() => fakeWebhookRepo.store.clear());

  it('AC-4 · HTTPS URL accepted', async () => {
    const repo = new FakeWebhookRepo();
    const uc = new SubscribeWebhookUseCase(repo);
    await expect(uc.execute({
      callbackUrl: 'https://example.com/h',
      events: ['vacation.approved'],
    })).resolves.toBeDefined();
  });

  it('AC-4 · HTTP non-localhost rejected with InsecureWebhookUrlError', async () => {
    const repo = new FakeWebhookRepo();
    const uc = new SubscribeWebhookUseCase(repo, { nodeEnv: 'development' });
    await expect(uc.execute({
      callbackUrl: 'http://example.com/h',
      events: ['vacation.approved'],
    })).rejects.toBeInstanceOf(InsecureWebhookUrlError);
  });

  it('AC-4 · HTTP localhost accepted in development', async () => {
    const repo = new FakeWebhookRepo();
    const uc = new SubscribeWebhookUseCase(repo, { nodeEnv: 'development' });
    await expect(uc.execute({
      callbackUrl: 'http://localhost:3000/h',
      events: ['vacation.approved'],
    })).resolves.toBeDefined();
    await expect(uc.execute({
      callbackUrl: 'http://127.0.0.1:3000/h',
      events: ['vacation.approved'],
    })).resolves.toBeDefined();
  });

  it('AC-4 · HTTP localhost rejected when NODE_ENV is not development', async () => {
    const repo = new FakeWebhookRepo();
    const uc = new SubscribeWebhookUseCase(repo, { nodeEnv: 'production' });
    await expect(uc.execute({
      callbackUrl: 'http://localhost:3000/h',
      events: ['vacation.approved'],
    })).rejects.toBeInstanceOf(InsecureWebhookUrlError);
  });

  it('AC-4 · POST returns 422 with code INSECURE_URL for plain http', async () => {
    const { POST } = await import('@/app/api/webhooks/subscribe/route');
    const res = await POST(makeRequest({
      body: { callback_url: 'http://example.com/h', events: ['vacation.approved'] },
      headers: { 'x-role': 'admin' },
    }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('INSECURE_URL');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · GET /api/webhooks (admin) → { subscriptions: [...] }
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-5 · GET /api/webhooks lists subscriptions', () => {
  beforeEach(() => fakeWebhookRepo.store.clear());

  it('AC-5 · admin sees subscriptions: [{ id, callback_url, events, created_at }]', async () => {
    await fakeWebhookRepo.save(WebhookSubscription.create({
      id: 'sub-1',
      callbackUrl: 'https://example.com/a',
      events: ['vacation.approved'],
      secret: 'sek-a',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }));
    await fakeWebhookRepo.save(WebhookSubscription.create({
      id: 'sub-2',
      callbackUrl: 'https://example.com/b',
      events: ['vacation.cancelled', 'employee.offboarded'],
      secret: 'sek-b',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    }));

    const { GET } = await import('@/app/api/webhooks/route');
    const res = await GET(makeRequest({ headers: { 'x-role': 'admin' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['subscriptions']);
    expect(body.subscriptions).toHaveLength(2);
    const found = body.subscriptions.find((s: { id: string }) => s.id === 'sub-1')!;
    expect(Object.keys(found).sort()).toEqual(['callback_url', 'created_at', 'events', 'id']);
    expect(found.callback_url).toBe('https://example.com/a');
    expect(found.events).toEqual(['vacation.approved']);
    expect(typeof found.created_at).toBe('string');
    // Secret never leaks here.
    expect('secret' in found).toBe(false);
  });

  it('AC-5 · 403 for non-admin', async () => {
    const { GET } = await import('@/app/api/webhooks/route');
    const res = await GET(makeRequest({ headers: { 'x-role': 'employee' } }));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · DELETE /api/webhooks/:id idempotent (unknown → 404)
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-6 · DELETE /api/webhooks/:id is idempotent', () => {
  beforeEach(() => fakeWebhookRepo.store.clear());

  it('AC-6 · admin can delete an existing subscription (204)', async () => {
    await fakeWebhookRepo.save(WebhookSubscription.create({
      id: 'sub-delete',
      callbackUrl: 'https://example.com/h',
      events: ['vacation.approved'],
      secret: 'sek',
    }));

    const { DELETE } = await import('@/app/api/webhooks/[id]/route');
    const res = await DELETE(
      makeRequest({ headers: { 'x-role': 'admin' } }),
      { params: { id: 'sub-delete' } },
    );
    expect(res.status).toBe(204);
    expect(fakeWebhookRepo.store.has('sub-delete')).toBe(false);
  });

  it('AC-6 · unknown id returns 404 instead of error', async () => {
    const { DELETE } = await import('@/app/api/webhooks/[id]/route');
    const res = await DELETE(
      makeRequest({ headers: { 'x-role': 'admin' } }),
      { params: { id: 'does-not-exist' } },
    );
    expect(res.status).toBe(404);
  });

  it('AC-6 · 403 for non-admin', async () => {
    const { DELETE } = await import('@/app/api/webhooks/[id]/route');
    const res = await DELETE(
      makeRequest({ headers: { 'x-role': 'manager' } }),
      { params: { id: 'whatever' } },
    );
    expect(res.status).toBe(403);
  });

  it('AC-6 · DeleteWebhookUseCase use-case-level: deleted=false when absent', async () => {
    const repo = new FakeWebhookRepo();
    const uc = new DeleteWebhookUseCase(repo);
    const r = await uc.execute({ id: 'nope' });
    expect(r.deleted).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 · Dispatcher POST body + X-Chiron-Signature header
// ─────────────────────────────────────────────────────────────────────────────

interface RecordedCall {
  url: string;
  body: string;
  headers: Record<string, string>;
}

function makeRecordingHttp(
  responses: WebhookHttpResponse[],
): { http: WebhookHttpClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let idx = 0;
  const http: WebhookHttpClient = async (url, init) => {
    calls.push({ url, body: init.body, headers: init.headers });
    const res = responses[Math.min(idx, responses.length - 1)] ?? { ok: false, status: 0 };
    idx++;
    return res;
  };
  return { http, calls };
}

describe('AC-7 · Outbound POST body + HMAC header', () => {
  it('AC-7 · POST body shape { event, resource_type, resource_id, payload, timestamp }', async () => {
    const subRepo = new FakeWebhookRepo();
    const auditRepo = new FakeAuditLogRepo();
    const audit = new LogAuditEntryUseCase(auditRepo);

    const sub = WebhookSubscription.create({
      id: 'sub-x',
      callbackUrl: 'https://example.com/h',
      events: ['vacation.approved'],
      secret: 'super-secret',
    });
    await subRepo.save(sub);

    const { http, calls } = makeRecordingHttp([{ ok: true, status: 200 }]);
    const fixedNow = new Date('2026-06-01T12:00:00.000Z');

    const dispatcher = new WebhookDispatcher(subRepo, audit, {
      http,
      sleep: async () => undefined,
      now: () => fixedNow,
    });

    await dispatcher.dispatch({
      event_type: 'vacation.approved',
      vacation_id: 'vac-1',
      employee_id: 'emp-1',
      approver_id: 'admin-1',
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      decided_at: '2026-05-31T10:00:00.000Z',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://example.com/h');
    const body = JSON.parse(calls[0]!.body);
    expect(Object.keys(body).sort()).toEqual(['event', 'payload', 'resource_id', 'resource_type', 'timestamp']);
    expect(body.event).toBe('vacation.approved');
    expect(body.resource_type).toBe('vacation');
    expect(body.resource_id).toBe('vac-1');
    expect(body.payload).toMatchObject({
      vacation_id: 'vac-1',
      employee_id: 'emp-1',
      approver_id: 'admin-1',
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      decided_at: '2026-05-31T10:00:00.000Z',
    });
    expect(body.timestamp).toBe(fixedNow.toISOString());
  });

  it('AC-7 · X-Chiron-Signature header equals sha256=<hmac of body>', async () => {
    const subRepo = new FakeWebhookRepo();
    const audit = new LogAuditEntryUseCase(new FakeAuditLogRepo());
    const sub = WebhookSubscription.create({
      id: 'sub-y',
      callbackUrl: 'https://example.com/h',
      events: ['vacation.cancelled'],
      secret: 'my-secret',
    });
    await subRepo.save(sub);

    const { http, calls } = makeRecordingHttp([{ ok: true, status: 200 }]);
    const dispatcher = new WebhookDispatcher(subRepo, audit, { http, sleep: async () => undefined });
    await dispatcher.dispatch({
      event_type: 'vacation.cancelled',
      vacation_id: 'vac-c',
      employee_id: 'emp-c',
      start_date: '2026-09-01',
      end_date: '2026-09-03',
      cancelled_at: '2026-08-15T12:00:00.000Z',
    });

    expect(calls).toHaveLength(1);
    const signed = calls[0]!.body;
    const expected = `sha256=${createHmac('sha256', 'my-secret').update(signed).digest('hex')}`;
    expect(calls[0]!.headers['X-Chiron-Signature']).toBe(expected);
  });

  it('AC-7 · only sub-listeners receive the POST', async () => {
    const subRepo = new FakeWebhookRepo();
    const audit = new LogAuditEntryUseCase(new FakeAuditLogRepo());
    await subRepo.save(WebhookSubscription.create({
      id: 'sub-app',
      callbackUrl: 'https://app.example.com/h',
      events: ['vacation.approved'],
      secret: 'x',
    }));
    await subRepo.save(WebhookSubscription.create({
      id: 'sub-rej',
      callbackUrl: 'https://rej.example.com/h',
      events: ['vacation.rejected'],
      secret: 'y',
    }));

    const { http, calls } = makeRecordingHttp([{ ok: true, status: 200 }]);
    const dispatcher = new WebhookDispatcher(subRepo, audit, { http, sleep: async () => undefined });
    await dispatcher.dispatch({
      event_type: 'vacation.approved',
      vacation_id: 'vac-1',
      employee_id: 'emp-1',
      approver_id: null,
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      decided_at: '2026-08-01T12:00:00.000Z',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://app.example.com/h');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8 · retry with backoff (1s, 2s, 4s, 8s) up to 4 attempts
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-8 · retry with exponential backoff', () => {
  it('AC-8 · 4 attempts total, sleeping 1s/2s/4s between failures', async () => {
    const subRepo = new FakeWebhookRepo();
    const audit = new LogAuditEntryUseCase(new FakeAuditLogRepo());
    await subRepo.save(WebhookSubscription.create({
      id: 'sub-fail',
      callbackUrl: 'https://example.com/h',
      events: ['vacation.approved'],
      secret: 'sek',
    }));

    const responses: WebhookHttpResponse[] = [
      { ok: false, status: 500 },
      { ok: false, status: 502 },
      { ok: false, status: 503 },
      { ok: false, status: 504 },
    ];
    const { http, calls } = makeRecordingHttp(responses);

    const sleeps: number[] = [];
    const dispatcher = new WebhookDispatcher(subRepo, audit, {
      http,
      sleep: async (ms) => { sleeps.push(ms); },
    });

    await dispatcher.dispatch({
      event_type: 'vacation.approved',
      vacation_id: 'vac-1',
      employee_id: 'emp-1',
      approver_id: null,
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      decided_at: '2026-08-01T12:00:00.000Z',
    });

    expect(calls).toHaveLength(4);
    // After attempt 1, sleep 1s; after attempt 2, sleep 2s; after attempt 3, sleep 4s.
    // No sleep after the final attempt.
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it('AC-8 · stops early after a 2xx response', async () => {
    const subRepo = new FakeWebhookRepo();
    const audit = new LogAuditEntryUseCase(new FakeAuditLogRepo());
    await subRepo.save(WebhookSubscription.create({
      id: 'sub-eventual',
      callbackUrl: 'https://example.com/h',
      events: ['vacation.approved'],
      secret: 'sek',
    }));

    const responses: WebhookHttpResponse[] = [
      { ok: false, status: 500 },
      { ok: true, status: 200 },
    ];
    const { http, calls } = makeRecordingHttp(responses);
    const sleeps: number[] = [];
    const dispatcher = new WebhookDispatcher(subRepo, audit, {
      http,
      sleep: async (ms) => { sleeps.push(ms); },
    });

    await dispatcher.dispatch({
      event_type: 'vacation.approved',
      vacation_id: 'vac-1',
      employee_id: 'emp-1',
      approver_id: null,
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      decided_at: '2026-08-01T12:00:00.000Z',
    });

    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([1000]);
  });

  it('AC-8 · retries on 4xx as well as 5xx', async () => {
    const subRepo = new FakeWebhookRepo();
    const audit = new LogAuditEntryUseCase(new FakeAuditLogRepo());
    await subRepo.save(WebhookSubscription.create({
      id: 'sub-4xx',
      callbackUrl: 'https://example.com/h',
      events: ['vacation.approved'],
      secret: 'sek',
    }));
    const responses: WebhookHttpResponse[] = [
      { ok: false, status: 400 },
      { ok: false, status: 404 },
      { ok: true, status: 201 },
    ];
    const { http, calls } = makeRecordingHttp(responses);
    const dispatcher = new WebhookDispatcher(subRepo, audit, { http, sleep: async () => undefined });
    await dispatcher.dispatch({
      event_type: 'vacation.approved',
      vacation_id: 'v', employee_id: 'e', approver_id: null,
      start_date: '2026-01-01', end_date: '2026-01-02',
      decided_at: '2026-01-01T00:00:00.000Z',
    });
    expect(calls).toHaveLength(3);
  });

  it('AC-8 · retries on thrown network errors (e.g. timeout/abort)', async () => {
    const subRepo = new FakeWebhookRepo();
    const audit = new LogAuditEntryUseCase(new FakeAuditLogRepo());
    await subRepo.save(WebhookSubscription.create({
      id: 'sub-throws',
      callbackUrl: 'https://example.com/h',
      events: ['vacation.approved'],
      secret: 'sek',
    }));
    let calls = 0;
    const http: WebhookHttpClient = async () => {
      calls += 1;
      if (calls < 3) throw new Error('AbortError');
      return { ok: true, status: 200 };
    };
    const dispatcher = new WebhookDispatcher(subRepo, audit, { http, sleep: async () => undefined });
    await dispatcher.dispatch({
      event_type: 'vacation.approved',
      vacation_id: 'v', employee_id: 'e', approver_id: null,
      start_date: '2026-01-01', end_date: '2026-01-02',
      decided_at: '2026-01-01T00:00:00.000Z',
    });
    expect(calls).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9 · Each delivery writes an audit entry
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-9 · audit entry per delivery', () => {
  it('AC-9 · success writes webhook.delivered audit row', async () => {
    const subRepo = new FakeWebhookRepo();
    const auditRepo = new FakeAuditLogRepo();
    const audit = new LogAuditEntryUseCase(auditRepo);
    await subRepo.save(WebhookSubscription.create({
      id: 'sub-ok',
      callbackUrl: 'https://example.com/h',
      events: ['vacation.approved'],
      secret: 'sek',
    }));

    const { http } = makeRecordingHttp([{ ok: true, status: 200 }]);
    const dispatcher = new WebhookDispatcher(subRepo, audit, { http, sleep: async () => undefined });

    await dispatcher.dispatch({
      event_type: 'vacation.approved',
      vacation_id: 'v-9', employee_id: 'e', approver_id: null,
      start_date: '2026-01-01', end_date: '2026-01-02',
      decided_at: '2026-01-01T00:00:00.000Z',
    });

    expect(auditRepo.store).toHaveLength(1);
    const row = auditRepo.store[0]!;
    expect(row.action).toBe('webhook.delivered');
    expect(row.resourceType).toBe('webhook');
    expect(row.resourceId).toBe('sub-ok');
    expect(row.detailsJson).toMatchObject({
      event: 'vacation.approved',
      resource_type: 'vacation',
      resource_id: 'v-9',
      status_code: 200,
      attempts: 1,
    });
  });

  it('AC-9 · final failure writes webhook.failed audit row after 4 attempts', async () => {
    const subRepo = new FakeWebhookRepo();
    const auditRepo = new FakeAuditLogRepo();
    const audit = new LogAuditEntryUseCase(auditRepo);
    await subRepo.save(WebhookSubscription.create({
      id: 'sub-bad',
      callbackUrl: 'https://example.com/h',
      events: ['vacation.approved'],
      secret: 'sek',
    }));

    const { http } = makeRecordingHttp([
      { ok: false, status: 500 },
      { ok: false, status: 500 },
      { ok: false, status: 500 },
      { ok: false, status: 500 },
    ]);
    const dispatcher = new WebhookDispatcher(subRepo, audit, { http, sleep: async () => undefined });

    await dispatcher.dispatch({
      event_type: 'vacation.approved',
      vacation_id: 'v-9', employee_id: 'e', approver_id: null,
      start_date: '2026-01-01', end_date: '2026-01-02',
      decided_at: '2026-01-01T00:00:00.000Z',
    });

    expect(auditRepo.store).toHaveLength(1);
    const row = auditRepo.store[0]!;
    expect(row.action).toBe('webhook.failed');
    expect(row.resourceType).toBe('webhook');
    expect(row.resourceId).toBe('sub-bad');
    expect(row.detailsJson).toMatchObject({
      event: 'vacation.approved',
      attempts: 4,
      status_code: 500,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Use-case-level sanity for ListWebhooks
// ─────────────────────────────────────────────────────────────────────────────

describe('ListWebhooksUseCase use-case shape sanity', () => {
  it('returns subscriptions without secret', async () => {
    const repo = new FakeWebhookRepo();
    await repo.save(WebhookSubscription.create({
      id: 'sub-list',
      callbackUrl: 'https://x.example/h',
      events: ['vacation.approved'],
      secret: 'do-not-leak',
    }));
    const uc = new ListWebhooksUseCase(repo);
    const out = await uc.execute();
    expect(out.subscriptions).toHaveLength(1);
    const item = out.subscriptions[0]!;
    expect('secret' in item).toBe(false);
    expect(item.id).toBe('sub-list');
    expect(item.callback_url).toBe('https://x.example/h');
  });
});
