/**
 * GetEmployeeUseCase
 *
 * Retrieves a single employee by ID and returns a response DTO.
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';

import type { EmployeeResponseDto, GetEmployeeDto } from '../../dtos/employee.dto';
import { EmployeeMapper } from '../../mappers/EmployeeMapper';

export class GetEmployeeUseCase {
  constructor(private readonly employeeRepository: IEmployeeRepository) {}

  async execute(dto: GetEmployeeDto): Promise<EmployeeResponseDto> {
    const employee = await this.employeeRepository.findById(dto.id);

    if (!employee) {
      throw new DomainNotFoundError('Employee', dto.id);
    }

    return EmployeeMapper.toResponseDto(employee);
  }
}
