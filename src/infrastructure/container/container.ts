/**
 * DI Container — Infrastructure
 *
 * Wires concrete implementations to their interfaces and
 * assembles fully-constructed use cases.
 *
 * This is the ONLY place where infrastructure implementations are
 * referenced.  The rest of the app talks only to interfaces.
 */

import { prisma } from '../database/prismaClient';
import { LogNotificationDispatcher } from '../notifications/LogNotificationDispatcher';
import { PrismaAreaRepository } from '../repositories/PrismaAreaRepository';
import { PrismaAuditLogRepository } from '../repositories/PrismaAuditLogRepository';
import { PrismaEmployeeRepository } from '../repositories/PrismaEmployeeRepository';
import { PrismaTimeEntryRepository } from '../repositories/PrismaTimeEntryRepository';
import { PrismaVacationRepository } from '../repositories/PrismaVacationRepository';

import { CreateAreaUseCase } from '@/application/use-cases/area/CreateAreaUseCase';
import { GetAreaWithMembersUseCase } from '@/application/use-cases/area/GetAreaWithMembersUseCase';
import { ListAreasUseCase } from '@/application/use-cases/area/ListAreasUseCase';
import { ListAuditLogsUseCase } from '@/application/use-cases/audit/ListAuditLogsUseCase';
import { LogAuditEntryUseCase } from '@/application/use-cases/audit/LogAuditEntryUseCase';
import { CreateEmployeeUseCase } from '@/application/use-cases/employee/CreateEmployeeUseCase';
import { DeleteEmployeeUseCase } from '@/application/use-cases/employee/DeleteEmployeeUseCase';
import { GetEmployeeUseCase } from '@/application/use-cases/employee/GetEmployeeUseCase';
import { ListEmployeesUseCase } from '@/application/use-cases/employee/ListEmployeesUseCase';
import { UpdateEmployeeUseCase } from '@/application/use-cases/employee/UpdateEmployeeUseCase';
import { GetEmployeeMonthlyReportUseCase } from '@/application/use-cases/report/GetEmployeeMonthlyReportUseCase';
import { HoursByAreaReportUseCase } from '@/application/use-cases/report/HoursByAreaReportUseCase';
import { VacationsSummaryReportUseCase } from '@/application/use-cases/report/VacationsSummaryReportUseCase';
import { ListTimeEntriesByEmployeeUseCase } from '@/application/use-cases/time-entry/ListTimeEntriesByEmployeeUseCase';
import { RegisterTimeEntryUseCase } from '@/application/use-cases/time-entry/RegisterTimeEntryUseCase';
import { ApproveVacationUseCase } from '@/application/use-cases/vacation/ApproveVacationUseCase';
import { CreateVacationUseCase } from '@/application/use-cases/vacation/CreateVacationUseCase';
import { GetVacationCalendarUseCase } from '@/application/use-cases/vacation/GetVacationCalendarUseCase';
import { RejectVacationUseCase } from '@/application/use-cases/vacation/RejectVacationUseCase';

// ── Repositories ─────────────────────────────────────────────────────────────

const employeeRepository = new PrismaEmployeeRepository(prisma);
const areaRepository = new PrismaAreaRepository(prisma);
const timeEntryRepository = new PrismaTimeEntryRepository(prisma);
const vacationRepository = new PrismaVacationRepository(prisma);
const auditLogRepository = new PrismaAuditLogRepository(prisma);

// ── Outbound adapters ────────────────────────────────────────────────────────

const notificationDispatcher = new LogNotificationDispatcher();

// ── Use Cases ─────────────────────────────────────────────────────────────────

export const container = {
  // Employee
  createEmployee: new CreateEmployeeUseCase(employeeRepository, areaRepository),
  getEmployee: new GetEmployeeUseCase(employeeRepository),
  listEmployees: new ListEmployeesUseCase(employeeRepository),
  updateEmployee: new UpdateEmployeeUseCase(employeeRepository, areaRepository),
  deleteEmployee: new DeleteEmployeeUseCase(employeeRepository),

  // Area
  createArea: new CreateAreaUseCase(areaRepository),
  listAreas: new ListAreasUseCase(areaRepository),
  getAreaWithMembers: new GetAreaWithMembersUseCase(areaRepository, employeeRepository),

  // TimeEntry
  registerTimeEntry: new RegisterTimeEntryUseCase(timeEntryRepository, employeeRepository),
  listTimeEntriesByEmployee: new ListTimeEntriesByEmployeeUseCase(
    timeEntryRepository,
    employeeRepository,
  ),

  // Reports
  hoursByAreaReport: new HoursByAreaReportUseCase(
    areaRepository,
    employeeRepository,
    timeEntryRepository,
  ),
  vacationsSummaryReport: new VacationsSummaryReportUseCase(
    employeeRepository,
    vacationRepository,
  ),
  getEmployeeMonthlyReport: new GetEmployeeMonthlyReportUseCase(
    employeeRepository,
    timeEntryRepository,
    vacationRepository,
  ),

  // Vacation
  createVacation: new CreateVacationUseCase(
    vacationRepository,
    employeeRepository,
    areaRepository,
    notificationDispatcher,
  ),
  approveVacation: new ApproveVacationUseCase(vacationRepository, notificationDispatcher),
  rejectVacation: new RejectVacationUseCase(vacationRepository, notificationDispatcher),
  getVacationCalendar: new GetVacationCalendarUseCase(employeeRepository, vacationRepository),

  // Audit
  logAuditEntry: new LogAuditEntryUseCase(auditLogRepository),
  listAuditLogs: new ListAuditLogsUseCase(auditLogRepository),
} as const;
