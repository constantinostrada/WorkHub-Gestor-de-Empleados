/**
 * Vacation Input Validation Schemas — minimal, scoped to T6.
 */

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const apiCreateVacationSchema = z.object({
  employee_id: z.string().min(1),
  start_date:  isoDate,
  end_date:    isoDate,
  reason:      z.string().max(1000).optional(),
});
