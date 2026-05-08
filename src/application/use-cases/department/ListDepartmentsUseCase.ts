/**
 * ListDepartmentsUseCase
 */

import type { IDepartmentRepository } from '@/domain/repositories/IDepartmentRepository';

import type { DepartmentResponseDto } from '../../dtos/department.dto';
import { DepartmentMapper } from '../../mappers/DepartmentMapper';

export class ListDepartmentsUseCase {
  constructor(private readonly departmentRepository: IDepartmentRepository) {}

  async execute(): Promise<DepartmentResponseDto[]> {
    const departments = await this.departmentRepository.findAll();
    return departments.map(DepartmentMapper.toResponseDto);
  }
}
