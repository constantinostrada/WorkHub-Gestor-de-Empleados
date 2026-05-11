/**
 * T12 — Audit trail para vacation cancellations.
 *
 * Bridges T6 (Audit logging) + T11 (Vacation.cancel) + T10 (Role-gating).
 *
 * AC-1 · CancelVacationUseCase result includes `vacation_status_before` +
 *        `vacation`, with the status captured BEFORE cancel().
 * AC-2 · POST /api/vacations/:id/cancel writes an audit row with
 *        action='vacation.cancelled', resource_type='vacation',
 *        resource_id=<vacationId>, actor_id=<X-Actor-Id>,
 *        details_json={ vacation_status_before, cancelled_at }.
 * AC-3 · Missing/empty X-Actor-Id → 400 { error: 'missing_actor_id' }
 *        AND no audit row is written.
 * AC-4 · Role-gating unchanged: route stays under
 *        withRole(['admin','manager','employee']).
 * AC-5..AC-7 · 3 use-case-level (route-level) cases:
 *   - success path: cancel + audit entry shape correct.
 *   - already_started: domain error → NO audit entry.
 *   - missing X-Actor-Id: 400 → NO audit entry.
 * AC-9 · Suite still green.
 *
 * Fakes follow the T6 + T11 patterns: FakeVacationRepository for vacation
 * loads + saves, FakeAuditLogRepository for audit assertions, swapped into
 * the container via jest.mock.
 */

import { AuditLog } from '@/domain/entities/AuditLog';
import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import type {
  AuditLogPaginatedResult,
  FindAuditLogsFilter,
  FindAuditLogsPagination,
  IAuditLogRepository,
} from '@/domain/repositories/IAuditLogRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

import { CancelVacationUseCase } from '../use-cases/vacation/CancelVacationUseCase';

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
  saveCalls = 0;
  async save(v: Vacation): Promise<void> {
    this.saveCalls += 1;
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
  ): Promise<Vacation[]> { return []; }
  async findOverlapping(
    _from: Date,
    _to: Date,
    _statuses?: VacationStatus[],
  ): Promise<Vacation[]> { return []; }
}

// ── Container mock — swap real repos for fakes ────────────────────────────

const fakeAuditRepo = new FakeAuditLogRepository();
const fakeVacationRepo = new FakeVacationRepository();

jest.mock('@/infrastructure/container/container', () => {
  const {
    LogAuditEntryUseCase: LogUC,
  } = jest.requireActual('../use-cases/audit/LogAuditEntryUseCase');
  const {
    CancelVacationUseCase: CancelUC,
  } = jest.requireActual('../use-cases/vacation/CancelVacationUseCase');

  return {
    container: {
      logAuditEntry: new LogUC(fakeAuditRepo),
      cancelVacation: new CancelUC(fakeVacationRepo),
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
    status: overrides.status,
  });
}

function makeRequest(opts: {
  headers?: Record<string, string>;
}): any {
  const headers = opts.headers ?? {};
  return {
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
  };
}

const VACATION_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000ac';

// ─── AC-1 · CancelVacationUseCase result shape (status captured BEFORE) ───

describe('AC-1 · CancelVacationUseCase returns vacation_status_before', () => {
  it('captures status BEFORE cancel() — PENDING → cancelled', async () => {
    const repo = new FakeVacationRepository();
    const v = makeVacation({ id: 'vac-pending', status: 'PENDING' });
    await repo.save(v);
    const useCase = new CancelVacationUseCase(repo);

    const now = new Date('2027-06-01T10:00:00Z');
    const result = await useCase.execute({ vacationId: 'vac-pending', now });

    expect(result.vacation.id).toBe('vac-pending');
    expect(result.vacation.status).toBe('cancelled');
    expect(result.vacation.cancelled_at).toBe(now.toISOString());
    expect(result.vacation_status_before).toBe('PENDING');
    // Status on the persisted aggregate is now CANCELLED (so the field really
    // was captured BEFORE the mutation, not derived afterwards).
    expect(repo.store.get('vac-pending')?.status).toBe('CANCELLED');
  });

  it('captures status BEFORE cancel() — APPROVED → cancelled', async () => {
    const repo = new FakeVacationRepository();
    const v = makeVacation({ id: 'vac-approved', status: 'APPROVED' });
    await repo.save(v);
    const useCase = new CancelVacationUseCase(repo);

    const now = new Date('2027-06-01T10:00:00Z');
    const result = await useCase.execute({ vacationId: 'vac-approved', now });

    expect(result.vacation_status_before).toBe('APPROVED');
    expect(result.vacation.status).toBe('cancelled');
  });
});

// ─── AC-5..AC-8 · route-level audit-trail cases ───────────────────────────

describe('T12 — route POST /api/vacations/:id/cancel writes audit', () => {
  beforeEach(() => {
    fakeAuditRepo.store.length = 0;
    fakeVacationRepo.store.clear();
    fakeVacationRepo.saveCalls = 0;
  });

  it('AC-6 · success path: cancel + audit entry with correct shape', async () => {
    const startDate = new Date('2027-08-10T00:00:00Z');
    const v = makeVacation({
      id: VACATION_ID,
      startDate,
      endDate: new Date('2027-08-15T00:00:00Z'),
      status: 'APPROVED',
    });
    await fakeVacationRepo.save(v);

    const { POST } = await import('@/app/api/vacations/[id]/cancel/route');
    const before = Date.now();
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': ACTOR_ID, 'x-role': 'employee' } }),
      { params: { id: VACATION_ID } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: VACATION_ID,
      status: 'cancelled',
      cancelled_at: expect.any(String),
    });

    // ── Audit assertions ────────────────────────────────────────────────
    expect(fakeAuditRepo.store).toHaveLength(1);
    const log = fakeAuditRepo.store[0]!;
    expect(log.actorId).toBe(ACTOR_ID);
    expect(log.action).toBe('vacation.cancelled');
    expect(log.resourceType).toBe('vacation');
    expect(log.resourceId).toBe(VACATION_ID);
    expect(log.detailsJson).toEqual({
      vacation_status_before: 'APPROVED',
      cancelled_at: body.cancelled_at,
    });
    expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('AC-7 · vacation already_started: NO audit entry created', async () => {
    const startDate = new Date('2027-08-10T00:00:00Z');
    const v = makeVacation({
      id: VACATION_ID,
      startDate,
      endDate: new Date('2027-08-15T00:00:00Z'),
      status: 'APPROVED',
    });
    // Force vacation.cancel() into the already-started rejection by setting
    // the vacation's start date in the past relative to "now". The Vacation
    // entity treats start_date <= now as already-started.
    // We rely on the system clock for the route's `new Date()` so just pick a
    // start date that is definitely in the past.
    const past = makeVacation({
      id: VACATION_ID,
      startDate: new Date('2020-01-01T00:00:00Z'),
      endDate: new Date('2020-01-05T00:00:00Z'),
      status: 'APPROVED',
    });
    fakeVacationRepo.store.set(VACATION_ID, past);

    const { POST } = await import('@/app/api/vacations/[id]/cancel/route');
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': ACTOR_ID, 'x-role': 'employee' } }),
      { params: { id: VACATION_ID } },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('vacation_already_started');
    expect(body.start_date).toBe('2020-01-01T00:00:00.000Z');

    // The crucial T12 assertion: NO audit row was written.
    expect(fakeAuditRepo.store).toHaveLength(0);
    // Reference v to silence unused-var lint for the symmetric setup above.
    expect(v.id).toBe(VACATION_ID);
  });

  it('AC-8 · missing X-Actor-Id: 400 missing_actor_id + NO audit entry', async () => {
    const v = makeVacation({
      id: VACATION_ID,
      startDate: new Date('2027-08-10T00:00:00Z'),
      endDate: new Date('2027-08-15T00:00:00Z'),
      status: 'APPROVED',
    });
    await fakeVacationRepo.save(v);

    const { POST } = await import('@/app/api/vacations/[id]/cancel/route');
    const res = await POST(
      makeRequest({ headers: { 'x-role': 'employee' } }), // no x-actor-id
      { params: { id: VACATION_ID } },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'missing_actor_id' });

    // No audit entry written.
    expect(fakeAuditRepo.store).toHaveLength(0);
    // And the vacation was NOT cancelled (still APPROVED on the aggregate).
    expect(fakeVacationRepo.store.get(VACATION_ID)?.status).toBe('APPROVED');
    expect(fakeVacationRepo.saveCalls).toBe(1); // only the initial seed save
  });

  it('AC-8b · empty X-Actor-Id (whitespace) also rejected with 400', async () => {
    const v = makeVacation({
      id: VACATION_ID,
      status: 'PENDING',
    });
    await fakeVacationRepo.save(v);

    const { POST } = await import('@/app/api/vacations/[id]/cancel/route');
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': '   ', 'x-role': 'employee' } }),
      { params: { id: VACATION_ID } },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing_actor_id' });
    expect(fakeAuditRepo.store).toHaveLength(0);
  });
});

// ─── AC-4 · Role-gating unchanged ─────────────────────────────────────────

describe('AC-4 · role gating unchanged (admin / manager / employee allowed)', () => {
  beforeEach(() => {
    fakeAuditRepo.store.length = 0;
    fakeVacationRepo.store.clear();
  });

  it('rejects unknown role with 403, regardless of X-Actor-Id', async () => {
    const v = makeVacation({ id: VACATION_ID, status: 'PENDING' });
    await fakeVacationRepo.save(v);

    const { POST } = await import('@/app/api/vacations/[id]/cancel/route');
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': ACTOR_ID, 'x-role': 'guest' } }),
      { params: { id: VACATION_ID } },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(body.required_roles).toEqual(['admin', 'manager', 'employee']);
    expect(fakeAuditRepo.store).toHaveLength(0);
  });

  it('accepts employee role (same role-gate as T11)', async () => {
    const v = makeVacation({ id: VACATION_ID, status: 'PENDING' });
    await fakeVacationRepo.save(v);

    const { POST } = await import('@/app/api/vacations/[id]/cancel/route');
    const res = await POST(
      makeRequest({ headers: { 'x-actor-id': ACTOR_ID, 'x-role': 'employee' } }),
      { params: { id: VACATION_ID } },
    );
    expect(res.status).toBe(200);
  });
});
