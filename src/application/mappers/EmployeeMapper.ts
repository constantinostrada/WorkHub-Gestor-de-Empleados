/**
 * EmployeeMapper — Application Mapper
 *
 * Translates between domain Employee entities and EmployeeResponseDtos.
 * No infrastructure types cross this boundary.
 */

import type { Employee } from '@/domain/entities/Employee';

import type { EmployeeResponseDto } from '../dtos/employee.dto';

export class EmployeeMapper {
  static toResponseDto(employee: Employee): EmployeeResponseDto {
    return {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      fullName: employee.fullName,
      email: employee.email.value,
      phone: employee.phone,
      position: employee.position,
      salary: employee.salary.amount,
      currency: employee.salary.currency,
      status: employee.status,
      hireDate: employee.hireDate.toISOString(),
      departmentId: employee.departmentId,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString(),
    };
  }
}
