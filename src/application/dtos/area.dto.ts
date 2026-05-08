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
