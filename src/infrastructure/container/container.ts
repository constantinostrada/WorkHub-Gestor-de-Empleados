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
import { PrismaDepartmentRepository } from '../repositories/PrismaDepartmentRepository';
import { PrismaEmployeeRepository } from '../repositories/PrismaEmployeeRepository';

import { CreateDepartmentUseCase } from '@/application/use-cases/department/CreateDepartmentUseCase';
import { ListDepartmentsUseCase } from '@/application/use-cases/department/ListDepartmentsUseCase';
import { CreateEmployeeUseCase } from '@/application/use-cases/employee/CreateEmployeeUseCase';
import { DeleteEmployeeUseCase } from '@/application/use-cases/employee/DeleteEmployeeUseCase';
import { GetEmployeeUseCase } from '@/application/use-cases/employee/GetEmployeeUseCase';
import { ListEmployeesUseCase } from '@/application/use-cases/employee/ListEmployeesUseCase';
import { UpdateEmployeeUseCase } from '@/application/use-cases/employee/UpdateEmployeeUseCase';

// ── Repositories ─────────────────────────────────────────────────────────────

const employeeRepository = new PrismaEmployeeRepository(prisma);
const departmentRepository = new PrismaDepartmentRepository(prisma);

// ── Use Cases ─────────────────────────────────────────────────────────────────

export const container = {
  // Employee
  createEmployee: new CreateEmployeeUseCase(employeeRepository, departmentRepository),
  getEmployee: new GetEmployeeUseCase(employeeRepository),
  listEmployees: new ListEmployeesUseCase(employeeRepository),
  updateEmployee: new UpdateEmployeeUseCase(employeeRepository, departmentRepository),
  deleteEmployee: new DeleteEmployeeUseCase(employeeRepository),

  // Department
  createDepartment: new CreateDepartmentUseCase(departmentRepository),
  listDepartments: new ListDepartmentsUseCase(departmentRepository),
} as const;
