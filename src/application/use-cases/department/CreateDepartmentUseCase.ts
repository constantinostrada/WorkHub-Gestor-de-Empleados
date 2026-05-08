/**
 * CreateDepartmentUseCase
 */

import { Department } from '@/domain/entities/Department';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IDepartmentRepository } from '@/domain/repositories/IDepartmentRepository';

import type { CreateDepartmentDto, DepartmentResponseDto } from '../../dtos/department.dto';
import { DepartmentMapper } from '../../mappers/DepartmentMapper';
import { generateId } from '../../utils/generateId';

export class CreateDepartmentUseCase {
  constructor(private readonly departmentRepository: IDepartmentRepository) {}

  async execute(dto: CreateDepartmentDto): Promise<DepartmentResponseDto> {
    const existing = await this.departmentRepository.findByName(dto.name);
    if (existing) {
      throw new DomainValidationError(`A department named "${dto.name}" already exists.`);
    }

    const now = new Date();
    const department = Department.create({
      id: generateId(),
      name: dto.name,
      description: dto.description ?? null,
      createdAt: now,
      updatedAt: now,
    });

    await this.departmentRepository.save(department);
    return DepartmentMapper.toResponseDto(department);
  }
}
