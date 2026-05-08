/**
 * AreaMapper — Application Mapper
 */

import type { Area } from '@/domain/entities/Area';

import type { AreaResponseDto } from '../dtos/area.dto';

export class AreaMapper {
  static toResponseDto(area: Area): AreaResponseDto {
    return {
      id: area.id,
      name: area.name,
      description: area.description,
      managerId: area.managerId,
      createdAt: area.createdAt.toISOString(),
      updatedAt: area.updatedAt.toISOString(),
    };
  }
}
