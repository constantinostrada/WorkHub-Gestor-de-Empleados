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
import { CompositeNotificationDispatcher } from '../notifications/CompositeNotificationDispatcher';
import { LogNotificationDispatcher } from '../notifications/LogNotificationDispatcher';
import { WebhookDispatcher } from '../notifications/WebhookDispatcher';
import { PrismaAreaRepository } from '../repositories/PrismaAreaRepository';
import { PrismaAuditLogRepository } from '../repositories/PrismaAuditLogRepository';
import { PrismaEmployeeRepository } from '../repositories/PrismaEmployeeRepository';
import { PrismaTimeEntryRepository } from '../repositories/PrismaTimeEntryRepository';
import { PrismaVacationRepository } from '../repositories/PrismaVacationRepository';
import { PrismaWebhookSubscriptionRepository } from '../repositories/PrismaWebhookSubscriptionRepository';

import { CreateAreaUseCase } from '@/application/use-cases/area/CreateAreaUseCase';
import { GetAreaWithMembersUseCase } from '@/application/use-cases/area/GetAreaWithMembersUseCase';
import { ListAreasUseCase } from '@/application/use-cases/area/ListAreasUseCase';
import { ListAuditLogsUseCase } from '@/application/use-cases/audit/ListAuditLogsUseCase';
import { LogAuditEntryUseCase } from '@/application/use-cases/audit/LogAuditEntryUseCase';
import { CreateEmployeeUseCase } from '@/application/use-cases/employee/CreateEmployeeUseCase';
import { DeleteEmployeeUseCase } from '@/application/use-cases/employee/DeleteEmployeeUseCase';
import { GetEmployeeUseCase } from '@/application/use-cases/employee/GetEmployeeUseCase';
import { ListEmployeesUseCase } from '@/application/use-cases/employee/ListEmployeesUseCase';
import { TransferEmployeeUseCase } from '@/application/use-cases/employee/TransferEmployeeUseCase';
import { UpdateEmployeeUseCase } from '@/application/use-cases/employee/UpdateEmployeeUseCase';
import { GetAreaDashboardUseCase } from '@/application/use-cases/report/GetAreaDashboardUseCase';
import { GetEmployeeMonthlyReportUseCase } from '@/application/use-cases/report/GetEmployeeMonthlyReportUseCase';
import { HoursByAreaReportUseCase } from '@/application/use-cases/report/HoursByAreaReportUseCase';
import { VacationsSummaryReportUseCase } from '@/application/use-cases/report/VacationsSummaryReportUseCase';
import { ListTimeEntriesByEmployeeUseCase } from '@/application/use-cases/time-entry/ListTimeEntriesByEmployeeUseCase';
import { RegisterTimeEntryUseCase } from '@/application/use-cases/time-entry/RegisterTimeEntryUseCase';
import { ApproveVacationUseCase } from '@/application/use-cases/vacation/ApproveVacationUseCase';
import { BulkVacationActionUseCase } from '@/application/use-cases/vacation/BulkVacationActionUseCase';
import { CancelVacationUseCase } from '@/application/use-cases/vacation/CancelVacationUseCase';
import { CreateVacationUseCase } from '@/application/use-cases/vacation/CreateVacationUseCase';
import { GetVacationCalendarUseCase } from '@/application/use-cases/vacation/GetVacationCalendarUseCase';
import { RejectVacationUseCase } from '@/application/use-cases/vacation/RejectVacationUseCase';
import { DeleteWebhookUseCase } from '@/application/use-cases/webhook/DeleteWebhookUseCase';
import { ListWebhooksUseCase } from '@/application/use-cases/webhook/ListWebhooksUseCase';
import { SubscribeWebhookUseCase } from '@/application/use-cases/webhook/SubscribeWebhookUseCase';

// ── Repositories ─────────────────────────────────────────────────────────────

const employeeRepository = new PrismaEmployeeRepository(prisma);
const areaRepository = new PrismaAreaRepository(prisma);
const timeEntryRepository = new PrismaTimeEntryRepository(prisma);
const vacationRepository = new PrismaVacationRepository(prisma);
const auditLogRepository = new PrismaAuditLogRepository(prisma);
const webhookSubscriptionRepository = new PrismaWebhookSubscriptionRepository(prisma);

// ── Outbound adapters ────────────────────────────────────────────────────────

const logAuditEntry = new LogAuditEntryUseCase(auditLogRepository);
const webhookDispatcher = new WebhookDispatcher(
  webhookSubscriptionRepository,
  logAuditEntry,
);
const notificationDispatcher = new CompositeNotificationDispatcher([
  new LogNotificationDispatcher(),
  webhookDispatcher,
]);

// ── Use Cases ─────────────────────────────────────────────────────────────────

export const container = {
  // Employee
  createEmployee: new CreateEmployeeUseCase(employeeRepository, areaRepository),
  getEmployee: new GetEmployeeUseCase(employeeRepository),
  listEmployees: new ListEmployeesUseCase(employeeRepository),
  updateEmployee: new UpdateEmployeeUseCase(employeeRepository, areaRepository),
  deleteEmployee: new DeleteEmployeeUseCase(employeeRepository),
  transferEmployee: new TransferEmployeeUseCase(
    employeeRepository,
    areaRepository,
    vacationRepository,
    timeEntryRepository,
  ),

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
  areaDashboard: new GetAreaDashboardUseCase(
    areaRepository,
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
  cancelVacation: new CancelVacationUseCase(vacationRepository),
  getVacationCalendar: new GetVacationCalendarUseCase(employeeRepository, vacationRepository),
  bulkVacationAction: new BulkVacationActionUseCase(vacationRepository, areaRepository),

  // Audit
  logAuditEntry,
  listAuditLogs: new ListAuditLogsUseCase(auditLogRepository),

  // Webhooks
  subscribeWebhook: new SubscribeWebhookUseCase(webhookSubscriptionRepository),
  listWebhooks: new ListWebhooksUseCase(webhookSubscriptionRepository),
  deleteWebhook: new DeleteWebhookUseCase(webhookSubscriptionRepository),
} as const;
