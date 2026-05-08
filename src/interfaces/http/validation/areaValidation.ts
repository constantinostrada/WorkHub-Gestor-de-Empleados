/**
 * Area Input Validation Schemas
 */

import { z } from 'zod';

export const createAreaSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  managerId:   z.string().uuid().nullable().optional(),
});
