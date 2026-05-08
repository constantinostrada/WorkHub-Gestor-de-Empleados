/**
 * GetAreaWithMembersUseCase
 *
 * Loads an area by id and returns the AC-4 shape:
 *   { id, name, description, manager_id, members: [{ id, name, role, joined_at }] }
 *
 * Throws DomainNotFoundError when the id does not match an area
 * (mapped to HTTP 404 by the route handler — AC-6).
 */

import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import type { IAreaRepository } from '@/domain/repositories/IAreaRepository';
import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';

import type {
  AreaMemberDto,
  AreaWithMembersResponseDto,
  GetAreaDto,
} from '../../dtos/area.dto';

const ALL_MEMBERS_PAGE_SIZE = 1000;

export class GetAreaWithMembersUseCase {
  constructor(
    private readonly areaRepository: IAreaRepository,
    private readonly employeeRepository: IEmployeeRepository,
  ) {}

  async execute(dto: GetAreaDto): Promise<AreaWithMembersResponseDto> {
    const area = await this.areaRepository.findById(dto.id);
    if (!area) {
      throw new DomainNotFoundError('Area', dto.id);
    }

    const result = await this.employeeRepository.findAll(
      { areaId: area.id },
      { page: 1, pageSize: ALL_MEMBERS_PAGE_SIZE },
    );

    const members: AreaMemberDto[] = result.items.map((emp) => ({
      id: emp.id,
      name: emp.fullName,
      role: emp.position,
      joined_at: emp.hireDate.toISOString(),
    }));

    return {
      id: area.id,
      name: area.name,
      description: area.description,
      manager_id: area.managerId,
      members,
    };
  }
}
