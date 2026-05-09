/**
 * Area Input Validation Schemas
 */

import { z } from 'zod';

export const createAreaSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  managerId:   z.string().uuid().nullable().optional(),
});

// ── Public API surface (snake_case per AC-2) ────────────────────────────────

export const apiCreateAreaSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  manager_id:  z.string().uuid().nullable().optional(),
});
