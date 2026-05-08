/**
 * ListEmployeesUseCase
 *
 * Returns a paginated, filtered list of employees.
 */

import type { IEmployeeRepository } from '@/domain/repositories/IEmployeeRepository';

import type { ListEmployeesDto, PaginatedEmployeesResponseDto } from '../../dtos/employee.dto';
import { EmployeeMapper } from '../../mappers/EmployeeMapper';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

export class ListEmployeesUseCase {
  constructor(private readonly employeeRepository: IEmployeeRepository) {}

  async execute(dto: ListEmployeesDto): Promise<PaginatedEmployeesResponseDto> {
    const page = Math.max(dto.page ?? DEFAULT_PAGE, 1);
    const pageSize = Math.min(Math.max(dto.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100);

    const result = await this.employeeRepository.findAll(
      {
        departmentId: dto.departmentId,
        status: dto.status,
        searchTerm: dto.searchTerm,
      },
      { page, pageSize },
    );

    return {
      items: result.items.map(EmployeeMapper.toResponseDto),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  }
}
