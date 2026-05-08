/**
 * DepartmentMapper — Application Mapper
 */

import type { Department } from '@/domain/entities/Department';

import type { DepartmentResponseDto } from '../dtos/department.dto';

export class DepartmentMapper {
  static toResponseDto(department: Department): DepartmentResponseDto {
    return {
      id: department.id,
      name: department.name,
      description: department.description,
      createdAt: department.createdAt.toISOString(),
      updatedAt: department.updatedAt.toISOString(),
    };
  }
}
