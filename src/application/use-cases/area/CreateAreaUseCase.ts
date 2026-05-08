/**
 * CreateAreaUseCase
 */

import { Area } from '@/domain/entities/Area';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';

import type { CreateAreaDto, AreaResponseDto } from '../../dtos/area.dto';
import { AreaMapper } from '../../mappers/AreaMapper';
import { generateId } from '../../utils/generateId';

export class CreateAreaUseCase {
  constructor(private readonly areaRepository: IAreaRepository) {}

  async execute(dto: CreateAreaDto): Promise<AreaResponseDto> {
    const existing = await this.areaRepository.findByName(dto.name);
    if (existing) {
      throw new DomainValidationError(`An area named "${dto.name}" already exists.`);
    }

    const now = new Date();
    const area = Area.create({
      id: generateId(),
      name: dto.name,
      description: dto.description ?? null,
      managerId: dto.managerId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    await this.areaRepository.save(area);
    return AreaMapper.toResponseDto(area);
  }
}
