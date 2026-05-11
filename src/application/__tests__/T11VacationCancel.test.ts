/**
 * T11 — Vacation cancellation endpoint (use-case-level tests).
 *
 *   AC-3 · CancelVacationUseCase.execute({vacationId, now}) sets
 *          status='CANCELLED' + cancelled_at=now and persists via repo.
 *   AC-4 · Rejects with VacationAlreadyStartedError carrying start_date
 *          when start_date <= now.
 *   AC-5 · Rejects with VacationNotCancellableError carrying
 *          current_status when status ∈ {CANCELLED, REJECTED}.
 *   AC-7 · 4 cases total: success + already_started + status=CANCELLED
 *          + status=REJECTED, all driven through a FakeVacationRepository.
 */

import { CancelVacationUseCase } from '../use-cases/vacation/CancelVacationUseCase';

import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import { VacationAlreadyStartedError } from '@/domain/errors/VacationAlreadyStartedError';
import { VacationNotCancellableError } from '@/domain/errors/VacationNotCancellableError';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';

// ── Fake repository ─────────────────────────────────────────────────────────

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
  async findByEmployeeOverlapping(): Promise<Vacation[]> { return []; }
  async findOverlapping(
    _from: Date,
    _to: Date,
    _statuses?: VacationStatus[],
  ): Promise<Vacation[]> { return []; }
}

// ── Builder ─────────────────────────────────────────────────────────────────

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
    startDate: overrides.startDate ?? new Date('2027-01-10T00:00:00Z'),
    endDate: overrides.endDate ?? new Date('2027-01-15T00:00:00Z'),
    status: overrides.status,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('T11 — Vacation cancellation', () => {
  let repo: FakeVacationRepository;
  let useCase: CancelVacationUseCase;

  beforeEach(() => {
    repo = new FakeVacationRepository();
    useCase = new CancelVacationUseCase(repo);
  });

  describe('AC-3 · success', () => {
    it('sets status=CANCELLED and cancelled_at=now and persists', async () => {
      const v = makeVacation({
        id: 'vac-success',
        startDate: new Date('2027-03-01T00:00:00Z'),
        endDate: new Date('2027-03-05T00:00:00Z'),
        status: 'PENDING',
      });
      await repo.save(v);
      const saveCallsBefore = repo.saveCalls;

      const now = new Date('2027-02-20T10:00:00Z');
      const result = await useCase.execute({ vacationId: 'vac-success', now });

      expect(result.vacation).toEqual({
        id: 'vac-success',
        status: 'cancelled',
        cancelled_at: now.toISOString(),
      });
      expect(result.vacation_status_before).toBe('PENDING');
      // Entity in repo reflects the transition.
      const stored = repo.store.get('vac-success');
      expect(stored?.status).toBe('CANCELLED');
      expect(stored?.cancelledAt?.toISOString()).toBe(now.toISOString());
      // save() called again after cancel (so persistence happened).
      expect(repo.saveCalls).toBe(saveCallsBefore + 1);
    });

    it('also cancels an APPROVED vacation', async () => {
      const v = makeVacation({
        id: 'vac-approved',
        startDate: new Date('2027-03-01T00:00:00Z'),
        endDate: new Date('2027-03-05T00:00:00Z'),
        status: 'APPROVED',
      });
      await repo.save(v);

      const now = new Date('2027-02-20T10:00:00Z');
      const result = await useCase.execute({ vacationId: 'vac-approved', now });

      expect(result.vacation.status).toBe('cancelled');
      expect(result.vacation_status_before).toBe('APPROVED');
      expect(repo.store.get('vac-approved')?.status).toBe('CANCELLED');
    });
  });

  describe('AC-4 · already_started rejection', () => {
    it('throws VacationAlreadyStartedError when start_date <= now', async () => {
      const startDate = new Date('2027-03-01T00:00:00Z');
      const v = makeVacation({
        id: 'vac-started',
        startDate,
        endDate: new Date('2027-03-05T00:00:00Z'),
        status: 'APPROVED',
      });
      await repo.save(v);

      const now = new Date('2027-03-01T00:00:00Z'); // exactly on start
      await expect(
        useCase.execute({ vacationId: 'vac-started', now }),
      ).rejects.toBeInstanceOf(VacationAlreadyStartedError);

      try {
        await useCase.execute({ vacationId: 'vac-started', now });
      } catch (err) {
        expect((err as VacationAlreadyStartedError).startDate.toISOString()).toBe(
          startDate.toISOString(),
        );
      }
      // No mutation persisted (still APPROVED).
      expect(repo.store.get('vac-started')?.status).toBe('APPROVED');
    });

    it('throws VacationAlreadyStartedError when start_date < now', async () => {
      const v = makeVacation({
        id: 'vac-past',
        startDate: new Date('2027-03-01T00:00:00Z'),
        endDate: new Date('2027-03-05T00:00:00Z'),
        status: 'PENDING',
      });
      await repo.save(v);

      const now = new Date('2027-03-03T12:00:00Z');
      await expect(
        useCase.execute({ vacationId: 'vac-past', now }),
      ).rejects.toBeInstanceOf(VacationAlreadyStartedError);
    });
  });

  describe('AC-5 · not_cancellable rejection', () => {
    it('throws VacationNotCancellableError with current_status=CANCELLED', async () => {
      const v = makeVacation({
        id: 'vac-cancelled',
        startDate: new Date('2027-04-01T00:00:00Z'),
        endDate: new Date('2027-04-05T00:00:00Z'),
        status: 'CANCELLED',
      });
      await repo.save(v);

      const now = new Date('2027-03-20T10:00:00Z');
      await expect(
        useCase.execute({ vacationId: 'vac-cancelled', now }),
      ).rejects.toBeInstanceOf(VacationNotCancellableError);

      try {
        await useCase.execute({ vacationId: 'vac-cancelled', now });
      } catch (err) {
        expect((err as VacationNotCancellableError).currentStatus).toBe('CANCELLED');
      }
    });

    it('throws VacationNotCancellableError with current_status=REJECTED', async () => {
      const v = makeVacation({
        id: 'vac-rejected',
        startDate: new Date('2027-04-01T00:00:00Z'),
        endDate: new Date('2027-04-05T00:00:00Z'),
        status: 'REJECTED',
      });
      await repo.save(v);

      const now = new Date('2027-03-20T10:00:00Z');
      await expect(
        useCase.execute({ vacationId: 'vac-rejected', now }),
      ).rejects.toBeInstanceOf(VacationNotCancellableError);

      try {
        await useCase.execute({ vacationId: 'vac-rejected', now });
      } catch (err) {
        expect((err as VacationNotCancellableError).currentStatus).toBe('REJECTED');
      }
    });
  });
});
