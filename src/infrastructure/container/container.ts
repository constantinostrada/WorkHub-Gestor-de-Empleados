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
import { PrismaAreaRepository } from '../repositories/PrismaAreaRepository';
import { PrismaEmployeeRepository } from '../repositories/PrismaEmployeeRepository';
import { PrismaTimeEntryRepository } from '../repositories/PrismaTimeEntryRepository';
import { PrismaVacationRepository } from '../repositories/PrismaVacationRepository';

import { CreateAreaUseCase } from '@/application/use-cases/area/CreateAreaUseCase';
import { GetAreaWithMembersUseCase } from '@/application/use-cases/area/GetAreaWithMembersUseCase';
import { ListAreasUseCase } from '@/application/use-cases/area/ListAreasUseCase';
import { CreateEmployeeUseCase } from '@/application/use-cases/employee/CreateEmployeeUseCase';
import { DeleteEmployeeUseCase } from '@/application/use-cases/employee/DeleteEmployeeUseCase';
import { GetEmployeeUseCase } from '@/application/use-cases/employee/GetEmployeeUseCase';
import { ListEmployeesUseCase } from '@/application/use-cases/employee/ListEmployeesUseCase';
import { UpdateEmployeeUseCase } from '@/application/use-cases/employee/UpdateEmployeeUseCase';
import { ListTimeEntriesByEmployeeUseCase } from '@/application/use-cases/time-entry/ListTimeEntriesByEmployeeUseCase';
import { RegisterTimeEntryUseCase } from '@/application/use-cases/time-entry/RegisterTimeEntryUseCase';
import { ApproveVacationUseCase } from '@/application/use-cases/vacation/ApproveVacationUseCase';
import { CreateVacationUseCase } from '@/application/use-cases/vacation/CreateVacationUseCase';
import { GetVacationBalanceUseCase } from '@/application/use-cases/vacation/GetVacationBalanceUseCase';
import { ListVacationsUseCase } from '@/application/use-cases/vacation/ListVacationsUseCase';
import { RejectVacationUseCase } from '@/application/use-cases/vacation/RejectVacationUseCase';

// ── Repositories ─────────────────────────────────────────────────────────────

const employeeRepository = new PrismaEmployeeRepository(prisma);
const areaRepository = new PrismaAreaRepository(prisma);
const timeEntryRepository = new PrismaTimeEntryRepository(prisma);
const vacationRepository = new PrismaVacationRepository(prisma);

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

  // Vacation
  createVacation: new CreateVacationUseCase(vacationRepository, employeeRepository),
  approveVacation: new ApproveVacationUseCase(vacationRepository),
  rejectVacation: new RejectVacationUseCase(vacationRepository),
  getVacationBalance: new GetVacationBalanceUseCase(vacationRepository, employeeRepository),
  listVacations: new ListVacationsUseCase(vacationRepository, employeeRepository),
} as const;
