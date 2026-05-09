/**
 * T6 — Audit log endpoint
 *
 * Use-case-level tests. Route handlers are thin pass-throughs; the
 * use cases here own the filtering / pagination / response-shape rules
 * required by the ACs.
 *
 *   AC-1 · POST mutations write an audit_logs row (verified by exercising
 *           WriteAuditLogUseCase with the same payload shape route handlers
 *           use, plus a smoke test that the helper persists actor_id +
 *           details_json correctly)
 *   AC-2 · GET /api/audit?since=ISO returns logs sorted desc by created_at
 *   AC-3 · GET /api/audit?actor=<id> filters by actor
 *   AC-4 · GET /api/audit?action=<verb> filters by action
 *   AC-5 · Pagination with default limit=50 and max=200; offset honoured
 *   AC-6 · Response shape { logs, total, has_more }
 */

import { AuditLog, type AuditAction } from '@/domain/entities/AuditLog';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type {
  AuditLogQueryFilter,
  AuditLogQueryOptions,
  AuditLogQueryResult,
  IAuditLogRepository,
} from '@/domain/repositories/IAuditLogRepository';

import { ListAuditLogsUseCase } from '../use-cases/audit/ListAuditLogsUseCase';
import { WriteAuditLogUseCase } from '../use-cases/audit/WriteAuditLogUseCase';

// ── In-memory fake ─────────────────────────────────────────────────────────

class FakeAuditLogRepository implements IAuditLogRepository {
  readonly store: AuditLog[] = [];

  async save(log: AuditLog): Promise<void> {
    this.store.push(log);
  }

  async find(
    filter: AuditLogQueryFilter,
    options: AuditLogQueryOptions,
  ): Promise<AuditLogQueryResult> {
    let rows = [...this.store];
    if (filter.since !== undefined) {
      const sinceMs = filter.since.getTime();
      rows = rows.filter((r) => r.createdAt.getTime() >= sinceMs);
    }
    if (filter.actorId !== undefined) {
      rows = rows.filter((r) => r.actorId === filter.actorId);
    }
    if (filter.action !== undefined) {
      rows = rows.filter((r) => r.action === filter.action);
    }
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = rows.length;
    const items = rows.slice(options.offset, options.offset + options.limit);
    return { items, total };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeLog(overrides: Partial<{
  id: string;
  actorId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detailsJson: unknown;
  createdAt: Date;
}> = {}): AuditLog {
  return AuditLog.create({
    id: overrides.id ?? `id-${Math.random().toString(36).slice(2)}`,
    actorId: overrides.actorId ?? null,
    action: overrides.action ?? 'create',
    resourceType: overrides.resourceType ?? 'employee',
    resourceId: overrides.resourceId ?? 'res-1',
    detailsJson: overrides.detailsJson ?? { foo: 'bar' },
    createdAt: overrides.createdAt ?? new Date(),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('T6 Audit Log', () => {
  describe('AC-1 mutations create audit_logs rows', () => {
    it('WriteAuditLogUseCase persists a row with the expected fields', async () => {
      const repo = new FakeAuditLogRepository();
      const useCase = new WriteAuditLogUseCase(repo);

      await useCase.execute({
        actorId: 'emp-1',
        action: 'create',
        resourceType: 'employee',
        resourceId: 'new-emp-id',
        detailsJson: { name: 'Ana', email: 'ana@x.io', role: 'eng' },
      });

      expect(repo.store).toHaveLength(1);
      const row = repo.store[0]!;
      expect(row.actorId).toBe('emp-1');
      expect(row.action).toBe('create');
      expect(row.resourceType).toBe('employee');
      expect(row.resourceId).toBe('new-emp-id');
      expect(row.detailsJson).toEqual({ name: 'Ana', email: 'ana@x.io', role: 'eng' });
      expect(row.createdAt).toBeInstanceOf(Date);
    });

    it('writes a row per resource type (employee/area/vacation/time_entry)', async () => {
      const repo = new FakeAuditLogRepository();
      const useCase = new WriteAuditLogUseCase(repo);

      for (const rt of ['employee', 'area', 'vacation', 'time_entry']) {
        await useCase.execute({
          actorId: null,
          action: 'create',
          resourceType: rt,
          resourceId: `${rt}-1`,
          detailsJson: { rt },
        });
      }

      expect(repo.store.map((r) => r.resourceType).sort()).toEqual(
        ['area', 'employee', 'time_entry', 'vacation'],
      );
    });
  });

  describe('AC-2 GET /api/audit?since=ISO sorts desc by created_at', () => {
    it('returns logs DESC by createdAt and filters by since', async () => {
      const repo = new FakeAuditLogRepository();
      const t0 = new Date('2026-05-01T00:00:00Z');
      const t1 = new Date('2026-05-02T00:00:00Z');
      const t2 = new Date('2026-05-03T00:00:00Z');
      await repo.save(makeLog({ id: 'a', createdAt: t0 }));
      await repo.save(makeLog({ id: 'b', createdAt: t2 }));
      await repo.save(makeLog({ id: 'c', createdAt: t1 }));

      const useCase = new ListAuditLogsUseCase(repo);
      const result = await useCase.execute({ since: '2026-05-02T00:00:00Z' });

      expect(result.logs.map((l) => l.id)).toEqual(['b', 'c']);
      // Confirm DESC ordering by createdAt
      const dates = result.logs.map((l) => Date.parse(l.created_at));
      expect(dates[0]).toBeGreaterThanOrEqual(dates[1]!);
    });

    it('rejects since when not a valid ISO 8601 string', async () => {
      const useCase = new ListAuditLogsUseCase(new FakeAuditLogRepository());
      await expect(useCase.execute({ since: 'not-a-date' })).rejects.toBeInstanceOf(
        DomainValidationError,
      );
    });
  });

  describe('AC-3 GET /api/audit?actor=<id> filters by actor', () => {
    it('returns only logs for the given actor', async () => {
      const repo = new FakeAuditLogRepository();
      await repo.save(makeLog({ id: '1', actorId: 'emp-A' }));
      await repo.save(makeLog({ id: '2', actorId: 'emp-B' }));
      await repo.save(makeLog({ id: '3', actorId: 'emp-A' }));
      await repo.save(makeLog({ id: '4', actorId: null }));

      const useCase = new ListAuditLogsUseCase(repo);
      const result = await useCase.execute({ actor: 'emp-A' });

      expect(result.logs.every((l) => l.actor_id === 'emp-A')).toBe(true);
      expect(result.logs).toHaveLength(2);
    });
  });

  describe('AC-4 GET /api/audit?action=<verb> filters by action', () => {
    it.each(['create', 'update', 'delete'] as AuditAction[])(
      'filters by action=%s',
      async (verb) => {
        const repo = new FakeAuditLogRepository();
        await repo.save(makeLog({ id: '1', action: 'create' }));
        await repo.save(makeLog({ id: '2', action: 'update' }));
        await repo.save(makeLog({ id: '3', action: 'delete' }));

        const useCase = new ListAuditLogsUseCase(repo);
        const result = await useCase.execute({ action: verb });

        expect(result.logs).toHaveLength(1);
        expect(result.logs[0]!.action).toBe(verb);
      },
    );

    it('rejects unknown action verbs with DomainValidationError', async () => {
      const useCase = new ListAuditLogsUseCase(new FakeAuditLogRepository());
      await expect(useCase.execute({ action: 'modify' })).rejects.toBeInstanceOf(
        DomainValidationError,
      );
    });
  });

  describe('AC-5 pagination ?limit=N&offset=M (default=50, max=200)', () => {
    it('defaults limit to 50 when not specified', async () => {
      const repo = new FakeAuditLogRepository();
      for (let i = 0; i < 60; i++) {
        await repo.save(
          makeLog({ id: `id-${i}`, createdAt: new Date(2026, 0, 1, 0, 0, i) }),
        );
      }
      const useCase = new ListAuditLogsUseCase(repo);
      const result = await useCase.execute({});
      expect(result.logs).toHaveLength(50);
      expect(result.total).toBe(60);
    });

    it('caps limit at 200 even when caller asks for more', async () => {
      const repo = new FakeAuditLogRepository();
      for (let i = 0; i < 250; i++) {
        await repo.save(
          makeLog({ id: `id-${i}`, createdAt: new Date(2026, 0, 1, 0, 0, i) }),
        );
      }
      const useCase = new ListAuditLogsUseCase(repo);
      const result = await useCase.execute({ limit: 1000 });
      expect(result.logs).toHaveLength(200);
      expect(result.total).toBe(250);
    });

    it('honours offset', async () => {
      const repo = new FakeAuditLogRepository();
      for (let i = 0; i < 10; i++) {
        await repo.save(
          makeLog({
            id: `id-${i}`,
            createdAt: new Date(2026, 0, 1, 0, 0, i),
          }),
        );
      }
      const useCase = new ListAuditLogsUseCase(repo);
      // sorted desc → first page is id-9..id-5; second page id-4..id-0
      const second = await useCase.execute({ limit: 5, offset: 5 });
      expect(second.logs.map((l) => l.id)).toEqual(['id-4', 'id-3', 'id-2', 'id-1', 'id-0']);
    });
  });

  describe('AC-6 response shape { logs, total, has_more }', () => {
    it('returns the right shape and has_more flips at the boundary', async () => {
      const repo = new FakeAuditLogRepository();
      for (let i = 0; i < 12; i++) {
        await repo.save(
          makeLog({ id: `id-${i}`, createdAt: new Date(2026, 0, 1, 0, 0, i) }),
        );
      }
      const useCase = new ListAuditLogsUseCase(repo);

      const page1 = await useCase.execute({ limit: 5, offset: 0 });
      expect(Object.keys(page1).sort()).toEqual(['has_more', 'logs', 'total']);
      expect(Array.isArray(page1.logs)).toBe(true);
      expect(page1.total).toBe(12);
      expect(page1.has_more).toBe(true);

      const lastPage = await useCase.execute({ limit: 5, offset: 10 });
      expect(lastPage.logs).toHaveLength(2);
      expect(lastPage.has_more).toBe(false);
    });

    it('every log carries the documented snake_case fields', async () => {
      const repo = new FakeAuditLogRepository();
      await repo.save(
        makeLog({
          id: 'one',
          actorId: 'actor-1',
          action: 'create',
          resourceType: 'employee',
          resourceId: 'emp-1',
          detailsJson: { x: 1 },
        }),
      );
      const useCase = new ListAuditLogsUseCase(repo);
      const result = await useCase.execute({});

      const log = result.logs[0]!;
      expect(log).toEqual({
        id: 'one',
        actor_id: 'actor-1',
        action: 'create',
        resource_type: 'employee',
        resource_id: 'emp-1',
        details_json: { x: 1 },
        created_at: expect.any(String),
      });
    });
  });
});
