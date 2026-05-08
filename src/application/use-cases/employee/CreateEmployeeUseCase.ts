/**
 * CreateEmployeeUseCase
 *
 * Orchestrates the creation of a new Employee aggregate.
 *
 * Receives repository interfaces via constructor (dependency injection).
 * Returns a DTO — never the domain entity directly.
 */

import { Employee } from '@/domain/entities/Employee';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IDepartmentRepository } from '@/domain/repositories/IDepartmentRepository';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';
import { Email } from '@/domain/value-objects/Email';
import { EmployeeStatus } from '@/domain/value-objects/EmployeeStatus';
import { Money } from '@/domain/value-objects/Money';

import type { CreateEmployeeDto, EmployeeResponseDto } from '../../dtos/employee.dto';
import { EmployeeMapper } from '../../mappers/EmployeeMapper';
import { generateId } from '../../utils/generateId';

export class CreateEmployeeUseCase {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly departmentRepository: IDepartmentRepository,
  ) {}

  async execute(dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    // 1. Validate department exists
    const departmentExists = await this.departmentRepository.existsById(dto.departmentId);
    if (!departmentExists) {
      throw new DomainValidationError(`Department "${dto.departmentId}" does not exist.`);
    }

    // 2. Ensure e-mail is unique
    const emailAlreadyTaken = await this.employeeRepository.existsByEmail(dto.email);
    if (emailAlreadyTaken) {
      throw new DomainValidationError(`An employee with e-mail "${dto.email}" already exists.`);
    }

    // 3. Build value objects (validation is inside VOs)
    const email = Email.create(dto.email);
    const salary = Money.create(dto.salary, dto.currency ?? 'EUR');
    const hireDate = new Date(dto.hireDate);

    // 4. Construct the aggregate
    const now = new Date();
    const employee = Employee.create({
      id: generateId(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
      phone: dto.phone ?? null,
      position: dto.position,
      salary,
      status: EmployeeStatus.ACTIVE,
      hireDate,
      departmentId: dto.departmentId,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Persist
    await this.employeeRepository.save(employee);

    // 6. Return DTO
    return EmployeeMapper.toResponseDto(employee);
  }
}
