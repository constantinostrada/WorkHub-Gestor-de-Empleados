/**
 * Vacation Input Validation Schemas
 *
 * Public HTTP surface uses snake_case ({employee_id, ...}) per AC contract.
 * Translation to camelCase domain DTOs happens in the route handler.
 *
 * Only structural/format validation lives here. Business rules
 * (range overlap, status transitions, balance arithmetic) are enforced
 * by the domain entity / use cases.
 */

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const apiCreateVacationSchema = z.object({
  employee_id: z.string().min(1),
  start_date: isoDate,
  end_date: isoDate,
  reason: z.string().max(1000).optional(),
});

export const apiListVacationsSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'pending', 'approved', 'rejected']).optional(),
});

export const apiVacationBalanceSchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/, 'year must be YYYY')
    .optional(),
});
