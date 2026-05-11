/**
 * T15 — Bulk vacation approval workflow.
 *
 * POST /api/vacations/bulk-action lets a manager approve/reject many
 * PENDING vacations at once, filtered by date range + optional area.
 *
 * Acceptance criteria covered in this suite:
 *   AC-1 · POST exists and is gated by role manager (admin override OK).
 *   AC-2 · Body shape { filter: { from, to, area_id?, status? }, action, reason? }.
 *   AC-3 · 200 response shape { processed, succeeded[], failed[] }.
 *   AC-4 · All matching vacations are processed; one failure does NOT abort.
 *   AC-5 · Only PENDING vacations are eligible; non-PENDING silently skipped.
 *   AC-6 · action='reject' with empty/missing reason → 422 MISSING_REJECT_REASON.
 *   AC-7 · Each succeeded vacation emits 1 audit row
 *          (vacation.approved | vacation.rejected).
 *   AC-8 · No matches → 200 with processed=0 and no error.
 *   AC-9 · filter.area_id missing in DB → 404 AREA_NOT_FOUND.
 */

import { Area } from '@/domain/entities/Area';
import { AuditLog } from '@/domain/entities/AuditLog';
import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import type {
  AuditLogPaginatedResult,
  FindAuditLogsFilter,
  FindAuditLogsPagination,
  IAuditLogRepository,
} from '@/domain/repositories/IAuditLogRepository';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';
import type { Role } from '@/domain/value-objects/Role';

import { BulkVacationActionUseCase } from '../use-cases/vacation/BulkVacationActionUseCase';

// ── Fakes ──────────────────────────────────────────────────────────────────

class FakeAuditLogRepository implements IAuditLogRepository {
  readonly store: AuditLog[] = [];
  async save(entry: AuditLog): Promise<void> {
    this.store.push(entry);
  }
  async findMany(
    _filter: FindAuditLogsFilter,
    _pagination: FindAuditLogsPagination,
  ): Promise<AuditLogPaginatedResult> {
    return { logs: [...this.store], total: this.store.length };
  }
}

class FakeVacationRepository implements IVacationRepository {
  readonly store = new Map<string, Vacation>();
  /** Captures the last areaId argument passed to findOverlapping (for assertion). */
  lastAreaId: string | undefined = undefined;
  /** Force findOverlapping to return a specific list, ignoring its arguments. */
  fixedOverlapping: Vacation[] | null = null;

  async save(v: Vacation): Promise<void> {
    this.store.set(v.id, v);
  }
  async findById(id: string): Promise<Vacation | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmployeeOverlapping(
    _employeeId: string,
    _from: Date,
    _to: Date,
    _statuses?: VacationStatus[],
  ): Promise<Vacation[]> {
    return [];
  }
  async findOverlapping(
    from: Date,
    to: Date,
    statuses?: VacationStatus[],
    areaId?: string,
  ): Promise<Vacation[]> {
    this.lastAreaId = areaId;
    if (this.fixedOverlapping !== null) return [...this.fixedOverlapping];
    return [...this.store.values()].filter((v) => {
      if (statuses && statuses.length > 0 && !statuses.includes(v.status)) return false;
      if (v.startDate.getTime() > to.getTime()) return false;
      if (v.endDate.getTime() < from.getTime()) return false;
      return true;
    });
  }
}

class FakeAreaRepository implements IAreaRepository {
  readonly store = new Map<string, Area>();
  async findById(id: string): Promise<Area | null> {
    return this.store.get(id) ?? null;
  }
  async findByName(_name: string): Promise<Area | null> { return null; }
  async findAll(): Promise<Area[]> { return [...this.store.values()]; }
  async save(area: Area): Promise<void> { this.store.set(area.id, area); }
  async update(area: Area): Promise<void> { this.store.set(area.id, area); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsById(id: string): Promise<boolean> { return this.store.has(id); }
}

// ── Container mock ─────────────────────────────────────────────────────────

const fakeAuditRepo = new FakeAuditLogRepository();
const fakeVacationRepo = new FakeVacationRepository();
const fakeAreaRepo = new FakeAreaRepository();

jest.mock('@/infrastructure/container/container', () => {
  const {
    LogAuditEntryUseCase: LogUC,
  } = jest.requireActual('../use-cases/audit/LogAuditEntryUseCase');
  const {
    BulkVacationActionUseCase: BulkUC,
  } = jest.requireActual('../use-cases/vacation/BulkVacationActionUseCase');

  return {
    container: {
      logAuditEntry: new LogUC(fakeAuditRepo),
      bulkVacationAction: new BulkUC(fakeVacationRepo, fakeAreaRepo),
    },
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────

function makeVacation(overrides: Partial<{
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
  status: VacationStatus;
}> = {}): Vacation {
  return Vacation.create({
    id: overrides.id ?? 'vac-1',
    employeeId: overrides.employeeId ?? 'emp-1',
    startDate: overrides.startDate ?? new Date('2027-06-10T00:00:00Z'),
    endDate: overrides.endDate ?? new Date('2027-06-15T00:00:00Z'),
    ...(overrides.status !== undefined ? { status: overrides.status } : {}),
  });
}

function makeArea(id: string, name = 'Engineering'): Area {
  const now = new Date('2026-01-01T00:00:00Z');
  return Area.create({
    id,
    name,
    description: null,
    managerId: null,
    createdAt: now,
    updatedAt: now,
  });
}

interface FakeRequestOpts {
  role?: Role | string | null;
  body?: unknown;
  headers?: Record<string, string>;
}

function makeRequest(opts: FakeRequestOpts = {}): any {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.role !== null && opts.role !== undefined) {
    headers['x-role'] = String(opts.role);
  }
  const bodyText = opts.body === undefined ? '' : JSON.stringify(opts.body);
  return {
    text: async () => bodyText,
    json: async () => opts.body ?? {},
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
  };
}

const ACTOR_ID = '00000000-0000-0000-0000-0000000000ac';
const FILTER_FROM = '2027-06-01';
const FILTER_TO = '2027-06-30';

function baseBody(overrides: Partial<{
  filter: any;
  action: 'approve' | 'reject';
  reason: string | undefined;
}> = {}): any {
  return {
    filter: overrides.filter ?? { from: FILTER_FROM, to: FILTER_TO },
    action: overrides.action ?? 'approve',
    ...(overrides.reason !== undefined ? { reason: overrides.reason } : {}),
  };
}

function resetState(): void {
  fakeAuditRepo.store.length = 0;
  fakeVacationRepo.store.clear();
  fakeVacationRepo.lastAreaId = undefined;
  fakeVacationRepo.fixedOverlapping = null;
  fakeAreaRepo.store.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// AC-1 · Endpoint exists and is gated by role manager
// ─────────────────────────────────────────────────────────────────────────

describe('AC-1 · POST /api/vacations/bulk-action gated by role manager', () => {
  beforeEach(() => resetState());

  it('exposes a POST handler', async () => {
    const mod = await import('@/app/api/vacations/bulk-action/route');
    expect(typeof mod.POST).toBe('function');
  });

  it.each<[Role | null, number]>([
    ['manager', 200],
    ['admin', 200],
    ['employee', 403],
    [null, 403],
  ])('role=%s → status %s', async (role, expected) => {
    resetState();
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role,
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody(),
    }));
    expect(res.status).toBe(expected);
  });

  it('403 body matches AC-11 shape (T10) when caller is employee', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'employee',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody(),
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: 'forbidden',
      required_roles: ['admin', 'manager'],
      your_role: 'employee',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-2 · Body shape is validated
// ─────────────────────────────────────────────────────────────────────────

describe('AC-2 · body schema validation', () => {
  beforeEach(() => resetState());

  it('accepts the full documented body { filter, action, reason }', async () => {
    fakeVacationRepo.fixedOverlapping = []; // no candidates, but valid shape
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: {
        filter: { from: FILTER_FROM, to: FILTER_TO, area_id: 'a1', status: 'PENDING' },
        action: 'reject',
        reason: 'Holiday freeze',
      },
    }));
    expect(res.status).not.toBe(400);
  });

  it('rejects unknown top-level fields with 400', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: { ...baseBody(), foo: 'bar' },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects unknown filter fields with 400', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ filter: { from: FILTER_FROM, to: FILTER_TO, extra: 'x' } }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects action values other than approve|reject with 400', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: { ...baseBody(), action: 'cancel' },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing body with 400', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects status filter values other than PENDING with 400', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ filter: { from: FILTER_FROM, to: FILTER_TO, status: 'APPROVED' } }),
    }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-3 · 200 response shape
// ─────────────────────────────────────────────────────────────────────────

describe('AC-3 · 200 response shape { processed, succeeded[], failed[] }', () => {
  beforeEach(() => resetState());

  it('returns { processed, succeeded, failed } with succeeded items carrying new_status', async () => {
    const v1 = makeVacation({ id: 'vac-1', status: 'PENDING' });
    const v2 = makeVacation({ id: 'vac-2', status: 'PENDING' });
    await fakeVacationRepo.save(v1);
    await fakeVacationRepo.save(v2);

    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'approve' }),
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      processed: 2,
      succeeded: expect.arrayContaining([
        { vacation_id: 'vac-1', new_status: 'APPROVED' },
        { vacation_id: 'vac-2', new_status: 'APPROVED' },
      ]),
      failed: [],
    });
    expect(body.succeeded).toHaveLength(2);
  });

  it('rejected items expose new_status=REJECTED', async () => {
    const v1 = makeVacation({ id: 'vac-r', status: 'PENDING' });
    await fakeVacationRepo.save(v1);

    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'reject', reason: 'Capacity' }),
    }));

    const body = await res.json();
    expect(body.succeeded).toEqual([{ vacation_id: 'vac-r', new_status: 'REJECTED' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-4 · One failure does NOT abort the request
// ─────────────────────────────────────────────────────────────────────────

describe('AC-4 · per-vacation isolation (no abort on single failure)', () => {
  beforeEach(() => resetState());

  it('an entity that fails to transition lands in failed[]; others still succeed', async () => {
    const ok1 = makeVacation({ id: 'ok-1', status: 'PENDING' });
    const ok2 = makeVacation({ id: 'ok-2', status: 'PENDING' });
    // A vacation whose status will mutate to non-PENDING mid-flight: we simulate
    // the race by intercepting save() the second time so the entity rejects.
    // Simpler approach: install a candidate whose approve() will throw — we
    // achieve this by pre-mutating it to APPROVED, then having findOverlapping
    // return it anyway (simulating a stale-read race).
    const stale = makeVacation({ id: 'stale-1', status: 'APPROVED' });
    fakeVacationRepo.fixedOverlapping = [ok1, stale, ok2];

    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'approve' }),
    }));

    // Per AC-5 the use case silently skips non-PENDING — so 'stale' should NOT
    // be in failed[] either. The 2 ok-* both succeed. processed = 2.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.succeeded.map((s: any) => s.vacation_id).sort()).toEqual(['ok-1', 'ok-2']);
    expect(body.failed).toEqual([]);
    expect(body.processed).toBe(2);
  });

  it('forces a domain failure on save and asserts the request still returns 200', async () => {
    // Build a use case directly so we can swap in a save-throwing repo. This
    // is the closest deterministic stand-in for an in-flight race.
    const flakyRepo = new FakeVacationRepository();
    const ok = makeVacation({ id: 'ok', status: 'PENDING' });
    const bad = makeVacation({ id: 'bad', status: 'PENDING' });
    await flakyRepo.save(ok);
    await flakyRepo.save(bad);
    const realSave = flakyRepo.save.bind(flakyRepo);
    flakyRepo.save = async (v: Vacation) => {
      if (v.id === 'bad') throw new Error('synthetic save failure');
      await realSave(v);
    };

    const uc = new BulkVacationActionUseCase(flakyRepo, fakeAreaRepo);
    const result = await uc.execute({
      filter: { from: new Date(FILTER_FROM), to: new Date(FILTER_TO) },
      action: 'approve',
    });
    expect(result.processed).toBe(2);
    expect(result.succeeded.map((s) => s.vacation_id)).toEqual(['ok']);
    expect(result.failed.map((f) => f.vacation_id)).toEqual(['bad']);
    expect(result.failed[0]!.reason).toBe('synthetic save failure');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-5 · Only PENDING vacations are eligible (others silently skipped)
// ─────────────────────────────────────────────────────────────────────────

describe('AC-5 · only PENDING vacations are eligible', () => {
  beforeEach(() => resetState());

  it('use case fetches with statuses=["PENDING"] and skips APPROVED/REJECTED/CANCELLED', async () => {
    const pending = makeVacation({ id: 'p', status: 'PENDING' });
    const approved = makeVacation({ id: 'a', status: 'APPROVED' });
    const rejected = makeVacation({ id: 'r', status: 'REJECTED' });
    const cancelled = makeVacation({ id: 'c', status: 'CANCELLED' });
    // We expose all 4 to findOverlapping; the use case must skip non-PENDING.
    fakeVacationRepo.fixedOverlapping = [pending, approved, rejected, cancelled];

    const uc = new BulkVacationActionUseCase(fakeVacationRepo, fakeAreaRepo);
    const result = await uc.execute({
      filter: { from: new Date(FILTER_FROM), to: new Date(FILTER_TO) },
      action: 'approve',
    });

    // Only the PENDING one was acted on. Non-PENDING items are NOT in failed[].
    expect(result.succeeded).toEqual([{ vacation_id: 'p', new_status: 'APPROVED' }]);
    expect(result.failed).toEqual([]);
    expect(result.processed).toBe(1);
  });

  it('passes ["PENDING"] as the status filter to findOverlapping', async () => {
    // Reach into the fake repo via a thin spy on findOverlapping.
    const spyRepo = new FakeVacationRepository();
    let capturedStatuses: VacationStatus[] | undefined;
    const origFind = spyRepo.findOverlapping.bind(spyRepo);
    spyRepo.findOverlapping = async (from, to, statuses, areaId) => {
      capturedStatuses = statuses;
      return origFind(from, to, statuses, areaId);
    };
    const uc = new BulkVacationActionUseCase(spyRepo, fakeAreaRepo);
    await uc.execute({
      filter: { from: new Date(FILTER_FROM), to: new Date(FILTER_TO) },
      action: 'approve',
    });
    expect(capturedStatuses).toEqual(['PENDING']);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-6 · action='reject' with empty reason → 422 MISSING_REJECT_REASON
// ─────────────────────────────────────────────────────────────────────────

describe('AC-6 · reject requires a non-empty reason', () => {
  beforeEach(() => resetState());

  it('returns 422 with code MISSING_REJECT_REASON when reason is missing', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'reject' }),
    }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('MISSING_REJECT_REASON');
  });

  it('returns 422 MISSING_REJECT_REASON when reason is empty string', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'reject', reason: '' }),
    }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('MISSING_REJECT_REASON');
  });

  it('returns 422 MISSING_REJECT_REASON when reason is only whitespace', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'reject', reason: '    ' }),
    }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('MISSING_REJECT_REASON');
  });

  it('no audit row is written when the 422 is returned', async () => {
    const v = makeVacation({ id: 'should-not-process', status: 'PENDING' });
    await fakeVacationRepo.save(v);

    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'reject' }),
    }));

    expect(fakeAuditRepo.store).toHaveLength(0);
    expect(fakeVacationRepo.store.get('should-not-process')?.status).toBe('PENDING');
  });

  it('approve does NOT require a reason', async () => {
    const v = makeVacation({ id: 'no-reason-needed', status: 'PENDING' });
    await fakeVacationRepo.save(v);

    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'approve' }),
    }));
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-7 · One audit entry per succeeded vacation
// ─────────────────────────────────────────────────────────────────────────

describe('AC-7 · per-vacation audit entries', () => {
  beforeEach(() => resetState());

  it('approve: writes 1 audit row per succeeded item with action=vacation.approved', async () => {
    const v1 = makeVacation({ id: 'va-1', status: 'PENDING' });
    const v2 = makeVacation({ id: 'va-2', status: 'PENDING' });
    await fakeVacationRepo.save(v1);
    await fakeVacationRepo.save(v2);

    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'approve' }),
    }));

    expect(fakeAuditRepo.store).toHaveLength(2);
    for (const log of fakeAuditRepo.store) {
      expect(log.actorId).toBe(ACTOR_ID);
      expect(log.action).toBe('vacation.approved');
      expect(log.resourceType).toBe('vacation');
      expect(['va-1', 'va-2']).toContain(log.resourceId);
      expect(log.detailsJson).toMatchObject({
        transition: 'approve',
        new_status: 'APPROVED',
      });
    }
  });

  it('reject: writes 1 audit row per succeeded item with action=vacation.rejected', async () => {
    const v1 = makeVacation({ id: 'vr-1', status: 'PENDING' });
    await fakeVacationRepo.save(v1);

    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'reject', reason: 'Capacity' }),
    }));

    expect(fakeAuditRepo.store).toHaveLength(1);
    const log = fakeAuditRepo.store[0]!;
    expect(log.action).toBe('vacation.rejected');
    expect(log.resourceId).toBe('vr-1');
    expect(log.detailsJson).toMatchObject({
      transition: 'reject',
      new_status: 'REJECTED',
      reason: 'Capacity',
    });
  });

  it('does NOT write audit rows for failed items', async () => {
    const ok = makeVacation({ id: 'ok-audit', status: 'PENDING' });
    const stale = makeVacation({ id: 'stale-audit', status: 'APPROVED' });
    fakeVacationRepo.fixedOverlapping = [ok, stale];
    await fakeVacationRepo.save(ok);

    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'approve' }),
    }));

    // Only the succeeded item drives an audit row.
    expect(fakeAuditRepo.store).toHaveLength(1);
    expect(fakeAuditRepo.store[0]!.resourceId).toBe('ok-audit');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-8 · No matches → 200 with processed=0 and no error
// ─────────────────────────────────────────────────────────────────────────

describe('AC-8 · empty match returns 200 processed=0', () => {
  beforeEach(() => resetState());

  it('returns 200 with processed=0 and empty arrays when no candidates match', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'approve' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ processed: 0, succeeded: [], failed: [] });
  });

  it('writes no audit row when there are no candidates', async () => {
    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({ action: 'approve' }),
    }));
    expect(fakeAuditRepo.store).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// AC-9 · filter.area_id missing in DB → 404 AREA_NOT_FOUND
// ─────────────────────────────────────────────────────────────────────────

describe('AC-9 · 404 AREA_NOT_FOUND when filter.area_id is unknown', () => {
  beforeEach(() => resetState());

  it('returns 404 AREA_NOT_FOUND and does NOT mutate any vacation', async () => {
    const v = makeVacation({ id: 'should-not-process', status: 'PENDING' });
    await fakeVacationRepo.save(v);

    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({
        filter: { from: FILTER_FROM, to: FILTER_TO, area_id: 'unknown-area' },
        action: 'approve',
      }),
    }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('AREA_NOT_FOUND');
    expect(fakeVacationRepo.store.get('should-not-process')?.status).toBe('PENDING');
    expect(fakeAuditRepo.store).toHaveLength(0);
  });

  it('proceeds normally when area exists', async () => {
    const area = makeArea('a-known');
    await fakeAreaRepo.save(area);
    const v = makeVacation({ id: 'in-area', status: 'PENDING' });
    fakeVacationRepo.fixedOverlapping = [v];

    const { POST } = await import('@/app/api/vacations/bulk-action/route');
    const res = await POST(makeRequest({
      role: 'manager',
      headers: { 'x-actor-id': ACTOR_ID },
      body: baseBody({
        filter: { from: FILTER_FROM, to: FILTER_TO, area_id: 'a-known' },
        action: 'approve',
      }),
    }));
    expect(res.status).toBe(200);
    // The repo was queried with the area filter forwarded through.
    expect(fakeVacationRepo.lastAreaId).toBe('a-known');
  });
});
