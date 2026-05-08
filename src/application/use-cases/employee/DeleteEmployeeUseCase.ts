/**
 * DeleteEmployeeUseCase
 *
 * Soft-deletes (deactivates) or hard-deletes an employee depending on
 * the business policy. Currently performs a hard delete.
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';

import type { DeleteEmployeeDto } from '../../dtos/employee.dto';

export class DeleteEmployeeUseCase {
  constructor(private readonly employeeRepository: IEmployeeRepository) {}

  async execute(dto: DeleteEmployeeDto): Promise<void> {
    const exists = await this.employeeRepository.findById(dto.id);
    if (!exists) {
      throw new DomainNotFoundError('Employee', dto.id);
    }

    await this.employeeRepository.delete(dto.id);
  }
}
