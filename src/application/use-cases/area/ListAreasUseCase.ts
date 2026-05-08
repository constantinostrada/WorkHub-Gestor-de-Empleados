/**
 * ListAreasUseCase
 */

import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';

import type { AreaResponseDto } from '../../dtos/area.dto';
import { AreaMapper } from '../../mappers/AreaMapper';

export class ListAreasUseCase {
  constructor(private readonly areaRepository: IAreaRepository) {}

  async execute(): Promise<AreaResponseDto[]> {
    const areas = await this.areaRepository.findAll();
    return areas.map(AreaMapper.toResponseDto);
  }
}
