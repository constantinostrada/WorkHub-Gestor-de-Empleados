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

import { CreateAreaUseCase } from '@/application/use-cases/area/CreateAreaUseCase';
import { ListAreasUseCase } from '@/application/use-cases/area/ListAreasUseCase';
import { CreateEmployeeUseCase } from '@/application/use-cases/employee/CreateEmployeeUseCase';
import { DeleteEmployeeUseCase } from '@/application/use-cases/employee/DeleteEmployeeUseCase';
import { GetEmployeeUseCase } from '@/application/use-cases/employee/GetEmployeeUseCase';
import { ListEmployeesUseCase } from '@/application/use-cases/employee/ListEmployeesUseCase';
import { UpdateEmployeeUseCase } from '@/application/use-cases/employee/UpdateEmployeeUseCase';

// ── Repositories ─────────────────────────────────────────────────────────────

const employeeRepository = new PrismaEmployeeRepository(prisma);
const areaRepository = new PrismaAreaRepository(prisma);

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
} as const;
