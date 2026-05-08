/**
 * UpdateEmployeeUseCase
 *
 * Applies a partial update to an existing Employee aggregate.
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IDepartmentRepository } from '@/domain/repositories/IDepartmentRepository';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import { Employee } from '@/domain/entities/Employee';
import { Email } from '@/domain/value-objects/Email';
import { Money } from '@/domain/value-objects/Money';
import { isValidEmployeeStatus } from '@/domain/value-objects/EmployeeStatus';

import type { UpdateEmployeeDto, EmployeeResponseDto } from '../../dtos/employee.dto';
import { EmployeeMapper } from '../../mappers/EmployeeMapper';

export class UpdateEmployeeUseCase {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly departmentRepository: IDepartmentRepository,
  ) {}

  async execute(dto: UpdateEmployeeDto): Promise<EmployeeResponseDto> {
    const existing = await this.employeeRepository.findById(dto.id);
    if (!existing) {
      throw new DomainNotFoundError('Employee', dto.id);
    }

    // Validate new department if provided
    if (dto.departmentId !== undefined) {
      const deptExists = await this.departmentRepository.existsById(dto.departmentId);
      if (!deptExists) {
        throw new DomainValidationError(`Department "${dto.departmentId}" does not exist.`);
      }
    }

    // Reconstruct with updated fields, preserving domain rules
    const updatedSalary = dto.salary !== undefined
      ? Money.create(dto.salary, dto.currency ?? existing.salary.currency)
      : existing.salary;

    const updatedStatus = dto.status !== undefined
      ? (isValidEmployeeStatus(dto.status)
          ? dto.status
          : (() => { throw new DomainValidationError(`Invalid status: ${dto.status}`); })())
      : existing.status;

    const updated = Employee.create({
      id: existing.id,
      firstName: dto.firstName ?? existing.firstName,
      lastName: dto.lastName ?? existing.lastName,
      email: existing.email,        // e-mail is immutable after creation
      phone: dto.phone ?? existing.phone,
      position: dto.position ?? existing.position,
      salary: updatedSalary,
      status: updatedStatus,
      hireDate: existing.hireDate,  // hire date is immutable
      departmentId: dto.departmentId ?? existing.departmentId,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });

    await this.employeeRepository.update(updated);
    return EmployeeMapper.toResponseDto(updated);
  }
}
