/**
 * Area DTOs
 */

// ── Input DTOs ─────────────────────────────────────────────────────────────

export interface CreateAreaDto {
  name: string;
  description?: string;
  managerId?: string | null;
}

export interface UpdateAreaDto {
  id: string;
  name?: string;
  description?: string;
  managerId?: string | null;
}

export interface GetAreaDto {
  id: string;
}

// ── Output DTOs ───────────────────────────────────────────────────────────

export interface AreaResponseDto {
  id: string;
  name: string;
  description: string | null;
  managerId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Public API output (snake_case, AC-4) ────────────────────────────────────
//
// AC-4: GET /api/areas/:id must return:
//   { id, name, description, manager_id, members: [{ id, name, role, joined_at }] }
//
// `joined_at` has no per-assignment timestamp in the schema; we use
// `employee.hireDate` as a pragmatic substitute (documented as a decision).

export interface AreaMemberDto {
  id: string;
  name: string;       // employee full name
  role: string;       // employee position
  joined_at: string;  // ISO-8601, currently sourced from hireDate
}

export interface AreaWithMembersResponseDto {
  id: string;
  name: string;
  description: string | null;
  manager_id: string | null;
  members: AreaMemberDto[];
}
