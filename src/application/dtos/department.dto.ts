/**
 * Department DTOs
 */

// ── Input DTOs ─────────────────────────────────────────────────────────────

export interface CreateDepartmentDto {
  name: string;
  description?: string;
}

export interface UpdateDepartmentDto {
  id: string;
  name?: string;
  description?: string;
}

export interface GetDepartmentDto {
  id: string;
}

// ── Output DTOs ───────────────────────────────────────────────────────────

export interface DepartmentResponseDto {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
