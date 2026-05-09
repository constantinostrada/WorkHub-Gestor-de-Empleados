/**
 * TimeEntry Input Validation Schemas
 *
 * Public HTTP surface uses snake_case ({employee_id, ...}) per AC contract.
 * Translation to camelCase domain DTOs happens in the route handler.
 *
 * Only structural/format validation lives here.
 * Business rules (hours range, date-not-future, employee existence) are
 * enforced by the domain entity / use cases.
 */

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const apiRegisterTimeEntrySchema = z.object({
  employee_id: z.string().min(1),
  date:        isoDate,
  hours:       z.number(),
  notes:       z.string().max(1000).optional(),
});

export const apiListTimeEntriesRangeSchema = z.object({
  from: isoDate,
  to:   isoDate,
});
