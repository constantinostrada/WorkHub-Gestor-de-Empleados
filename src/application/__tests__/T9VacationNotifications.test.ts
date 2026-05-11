/**
 * T9 — Vacation request notifications (use-case-level tests)
 *
 *   AC-1 · POST /api/vacations dispatches "vacation.created" to the
 *          area manager with body fields {event_type, vacation_id,
 *          employee_id, employee_name, area_id, start_date, end_date,
 *          status: 'pending', created_at}.
 *   AC-2 · POST /api/vacations/:id/approve dispatches "vacation.approved"
 *          with body {event_type, vacation_id, employee_id, approver_id,
 *          start_date, end_date, decided_at}.
 *   AC-3 · POST /api/vacations/:id/reject dispatches "vacation.rejected"
 *          with optional `reason?` field.
 *   AC-4 · vacation.created is silently dropped (with console.warn) when
 *          the employee has no area OR the area has no manager.
 *   AC-5 · Dispatch is fire-and-forget: the use case never awaits it,
 *          and a dispatch failure does not affect the response.
 *   AC-6 · INotificationDispatcher port + LogNotificationDispatcher
 *          stub adapter wired in container; replaceable by DI.
 *   AC-7 · FakeNotificationDispatcher captures emitted events for
 *          assertion.
 */

import { ApproveVacationUseCase } from '../use-cases/vacation/ApproveVacationUseCase';
import { CreateVacationUseCase } from '../use-cases/vacation/CreateVacationUseCase';
import { RejectVacationUseCase } from '../use-cases/vacation/RejectVacationUseCase';
import { LogNotificationDispatcher } from '@/infrastructure/notifications/LogNotificationDispatcher';

import { Area } from '@/domain/entities/Area';
import { Employee } from '@/domain/entities/Employee';
import { Vacation, type VacationStatus } from '@/domain/entities/Vacation';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type {
  FindEmployeesFilter,
  IEmployeeRepository,
  PaginatedResult,
  PaginationOptions,
} from '@/domain/repositories/IEmployeeRepository';
import type { IVacationRepository } from '@/domain/repositories/IVacationRepository';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';

import type {
  INotificationDispatcher,
  NotificationEvent,
} from '@/application/ports/INotificationDispatcher';

// ── Fakes ────────────────────────────────────────────────────────────────────

class FakeNotificationDispatcher implements INotificationDispatcher {
  readonly events: NotificationEvent[] = [];

  async dispatch(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

class ThrowingNotificationDispatcher implements INotificationDispatcher {
  async dispatch(_event: NotificationEvent): Promise<void> {
    throw new Error('boom');
  }
}

class FakeEmployeeRepository implements IEmployeeRepository {
  readonly store = new Map<string, Employee>();

  async findById(id: string): Promise<Employee | null> {
    return this.store.get(id) ?? null;
  }
  async findByEmail(email: string): Promise<Employee | null> {
    for (const e of this.store.values()) if (e.email.value === email) return e;
    return null;
  }
  async findAll(
    _filter?: FindEmployeesFilter,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<Employee>> {
    const items = [...this.store.values()];
    return {
      items,
      total: items.length,
      page: pagination?.page ?? 1,
      pageSize: pagination?.pageSize ?? 20,
      totalPages: 1,
    };
  }
  async save(e: Employee): Promise<void> { this.store.set(e.id, e); }
  async update(e: Employee): Promise<void> { this.store.set(e.id, e); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsByEmail(email: string): Promise<boolean> {
    return (await this.findByEmail(email)) !== null;
  }
}

class FakeAreaRepository implements IAreaRepository {
  readonly store = new Map<string, Area>();

  async findById(id: string): Promise<Area | null> { return this.store.get(id) ?? null; }
  async findByName(name: string): Promise<Area | null> {
    for (const a of this.store.values()) if (a.name === name) return a;
    return null;
  }
  async findAll(): Promise<Area[]> { return [...this.store.values()]; }
  async save(a: Area): Promise<void> { this.store.set(a.id, a); }
  async update(a: Area): Promise<void> { this.store.set(a.id, a); }
  async delete(id: string): Promise<void> { this.store.delete(id); }
  async existsById(id: string): Promise<boolean> { return this.store.has(id); }
}

class FakeVacationRepository implements IVacationRepository {
  readonly store = new Map<string, Vacation>();

  async save(v: Vacation): Promise<void> { this.store.set(v.id, v); }
  async findById(id: string): Promise<Vacation | null> { return this.store.get(id) ?? null; }
  async findByEmployeeOverlapping(): Promise<Vacation[]> { return []; }
  async findOverlapping(
    _from: Date,
    _to: Date,
    _statuses?: VacationStatus[],
  ): Promise<Vacation[]> { return []; }
}

// ── Builders ─────────────────────────────────────────────────────────────────

function makeEmployee(overrides: Partial<{
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  areaId: string | null;
}> = {}): Employee {
  return Employee.create({
    id: overrides.id ?? 'emp-1',
    firstName: overrides.firstName ?? 'Ada',
    lastName: overrides.lastName ?? 'Lovelace',
    email: Email.create(overrides.email ?? 'ada@example.com'),
    phone: null,
    position: 'engineer',
    salary: Money.create(50000, 'EUR'),
    status: EmployeeStatus.ACTIVE,
    hireDate: new Date('2024-01-01T00:00:00Z'),
    areaId: overrides.areaId === undefined ? 'area-1' : overrides.areaId,
    role: 'employee',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  });
}

function makeArea(id = 'area-1', managerId: string | null = 'mgr-1'): Area {
  return Area.create({
    id,
    name: 'Engineering',
    description: null,
    managerId,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('T9 — vacation notifications', () => {
  let employees: FakeEmployeeRepository;
  let areas: FakeAreaRepository;
  let vacations: FakeVacationRepository;
  let dispatcher: FakeNotificationDispatcher;
  let createUC: CreateVacationUseCase;
  let approveUC: ApproveVacationUseCase;
  let rejectUC: RejectVacationUseCase;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    employees = new FakeEmployeeRepository();
    areas = new FakeAreaRepository();
    vacations = new FakeVacationRepository();
    dispatcher = new FakeNotificationDispatcher();
    createUC = new CreateVacationUseCase(vacations, employees, areas, dispatcher);
    approveUC = new ApproveVacationUseCase(vacations, dispatcher);
    rejectUC = new RejectVacationUseCase(vacations, dispatcher);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // AC-1 · vacation.created on POST /api/vacations
  describe('AC-1 · POST /api/vacations dispatches vacation.created', () => {
    it('emits vacation.created with the documented body to the area manager', async () => {
      await employees.save(makeEmployee());
      await areas.save(makeArea());

      const result = await createUC.execute({
        employeeId: 'emp-1',
        startDate: '2026-06-10',
        endDate: '2026-06-14',
        reason: 'family',
      });

      expect(dispatcher.events).toHaveLength(1);
      const ev = dispatcher.events[0];
      expect(ev).toEqual({
        event_type: 'vacation.created',
        vacation_id: result.id,
        employee_id: 'emp-1',
        employee_name: 'Ada Lovelace',
        area_id: 'area-1',
        start_date: '2026-06-10',
        end_date: '2026-06-14',
        status: 'pending',
        created_at: expect.any(String),
      });
    });
  });

  // AC-2 · vacation.approved on POST /api/vacations/:id/approve
  describe('AC-2 · POST /api/vacations/:id/approve dispatches vacation.approved', () => {
    it('emits vacation.approved with the documented body', async () => {
      const vacation = Vacation.create({
        id: 'vac-1',
        employeeId: 'emp-1',
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: new Date('2026-07-05T00:00:00Z'),
      });
      await vacations.save(vacation);

      const result = await approveUC.execute({ vacationId: 'vac-1', approverId: 'mgr-1' });

      expect(result.status).toBe('APPROVED');
      expect(dispatcher.events).toHaveLength(1);
      expect(dispatcher.events[0]).toEqual({
        event_type: 'vacation.approved',
        vacation_id: 'vac-1',
        employee_id: 'emp-1',
        approver_id: 'mgr-1',
        start_date: '2026-07-01',
        end_date: '2026-07-05',
        decided_at: expect.any(String),
      });
    });

    it('fails 404 when vacation id does not exist', async () => {
      await expect(
        approveUC.execute({ vacationId: 'nope', approverId: null }),
      ).rejects.toBeInstanceOf(DomainNotFoundError);
      expect(dispatcher.events).toHaveLength(0);
    });
  });

  // AC-3 · vacation.rejected on POST /api/vacations/:id/reject
  describe('AC-3 · POST /api/vacations/:id/reject dispatches vacation.rejected', () => {
    it('includes optional reason when provided', async () => {
      const vacation = Vacation.create({
        id: 'vac-2',
        employeeId: 'emp-1',
        startDate: new Date('2026-08-01T00:00:00Z'),
        endDate: new Date('2026-08-05T00:00:00Z'),
      });
      await vacations.save(vacation);

      await rejectUC.execute({
        vacationId: 'vac-2',
        approverId: 'mgr-1',
        reason: 'overlapping coverage',
      });

      expect(dispatcher.events).toHaveLength(1);
      expect(dispatcher.events[0]).toEqual({
        event_type: 'vacation.rejected',
        vacation_id: 'vac-2',
        employee_id: 'emp-1',
        approver_id: 'mgr-1',
        start_date: '2026-08-01',
        end_date: '2026-08-05',
        decided_at: expect.any(String),
        reason: 'overlapping coverage',
      });
    });

    it('omits reason field when not provided', async () => {
      const vacation = Vacation.create({
        id: 'vac-3',
        employeeId: 'emp-1',
        startDate: new Date('2026-09-01T00:00:00Z'),
        endDate: new Date('2026-09-02T00:00:00Z'),
      });
      await vacations.save(vacation);

      await rejectUC.execute({ vacationId: 'vac-3', approverId: null });

      expect(dispatcher.events).toHaveLength(1);
      expect(dispatcher.events[0]).not.toHaveProperty('reason');
    });
  });

  // AC-4 · silent discard when no area / no manager
  describe('AC-4 · silently drops vacation.created when no area or no manager', () => {
    it('skips dispatch when employee has no area', async () => {
      await employees.save(makeEmployee({ areaId: null }));

      const result = await createUC.execute({
        employeeId: 'emp-1',
        startDate: '2026-06-10',
        endDate: '2026-06-14',
      });

      expect(result.id).toBeDefined();
      expect(dispatcher.events).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('skips dispatch when area has no manager', async () => {
      await employees.save(makeEmployee({ areaId: 'area-x' }));
      await areas.save(makeArea('area-x', null));

      const result = await createUC.execute({
        employeeId: 'emp-1',
        startDate: '2026-06-10',
        endDate: '2026-06-14',
      });

      expect(result.id).toBeDefined();
      expect(dispatcher.events).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  // AC-5 · fire-and-forget: dispatch failures don't break the use case
  describe('AC-5 · async fire-and-forget', () => {
    it('does not propagate dispatch failures from create', async () => {
      const throwing = new ThrowingNotificationDispatcher();
      const uc = new CreateVacationUseCase(vacations, employees, areas, throwing);
      await employees.save(makeEmployee());
      await areas.save(makeArea());

      const result = await uc.execute({
        employeeId: 'emp-1',
        startDate: '2026-06-10',
        endDate: '2026-06-14',
      });

      expect(result.id).toBeDefined();
    });

    it('does not propagate dispatch failures from approve', async () => {
      const throwing = new ThrowingNotificationDispatcher();
      const uc = new ApproveVacationUseCase(vacations, throwing);
      const vacation = Vacation.create({
        id: 'vac-aa',
        employeeId: 'emp-1',
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: new Date('2026-07-05T00:00:00Z'),
      });
      await vacations.save(vacation);

      await expect(
        uc.execute({ vacationId: 'vac-aa', approverId: null }),
      ).resolves.toBeDefined();
    });

    it('does not await the dispatcher (response returns before dispatch completes)', async () => {
      const slow: INotificationDispatcher = {
        dispatch: () => new Promise((resolve) => setTimeout(resolve, 100)),
      };
      const uc = new CreateVacationUseCase(vacations, employees, areas, slow);
      await employees.save(makeEmployee());
      await areas.save(makeArea());

      const t0 = Date.now();
      await uc.execute({
        employeeId: 'emp-1',
        startDate: '2026-06-10',
        endDate: '2026-06-14',
      });
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(80);
    });
  });

  // AC-6 · LogNotificationDispatcher stub
  describe('AC-6 · LogNotificationDispatcher stub adapter', () => {
    it('writes the event JSON to console.log', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        const dispatcher = new LogNotificationDispatcher();
        const ev: NotificationEvent = {
          event_type: 'vacation.created',
          vacation_id: 'v-1',
          employee_id: 'e-1',
          employee_name: 'Ada Lovelace',
          area_id: 'a-1',
          start_date: '2026-06-10',
          end_date: '2026-06-14',
          status: 'pending',
          created_at: '2026-06-09T12:00:00.000Z',
        };
        await dispatcher.dispatch(ev);
        expect(logSpy).toHaveBeenCalledWith('[notification]', JSON.stringify(ev));
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  // AC-7 · FakeNotificationDispatcher behaviour combined
  describe('AC-7 · FakeNotificationDispatcher captures all transitions', () => {
    it('captures created → approved sequence', async () => {
      await employees.save(makeEmployee());
      await areas.save(makeArea());
      const created = await createUC.execute({
        employeeId: 'emp-1',
        startDate: '2026-06-10',
        endDate: '2026-06-14',
      });
      await approveUC.execute({ vacationId: created.id, approverId: 'mgr-1' });

      const types = dispatcher.events.map((e) => e.event_type);
      expect(types).toEqual(['vacation.created', 'vacation.approved']);
    });

    it('captures created → rejected with reason', async () => {
      await employees.save(makeEmployee());
      await areas.save(makeArea());
      const created = await createUC.execute({
        employeeId: 'emp-1',
        startDate: '2026-06-10',
        endDate: '2026-06-14',
      });
      await rejectUC.execute({
        vacationId: created.id,
        approverId: 'mgr-1',
        reason: 'team load',
      });

      const types = dispatcher.events.map((e) => e.event_type);
      expect(types).toEqual(['vacation.created', 'vacation.rejected']);
      const last = dispatcher.events[1] as { reason?: string };
      expect(last.reason).toBe('team load');
    });
  });
});
