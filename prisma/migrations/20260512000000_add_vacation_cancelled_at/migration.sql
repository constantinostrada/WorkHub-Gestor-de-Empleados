-- T11: Vacation cancellation — add CANCELLED enum value + cancelled_at column.
-- Applied as manual SQL because PG16 + Prisma migrate dev hits P1010 (schema
-- ownership). The migration is idempotent on re-runs against an already-patched DB.

-- 1. Extend the vacation_status enum with the new CANCELLED variant.
ALTER TYPE "vacation_status" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- 2. Add the nullable cancelled_at column.
ALTER TABLE "vacations"
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ NULL;
