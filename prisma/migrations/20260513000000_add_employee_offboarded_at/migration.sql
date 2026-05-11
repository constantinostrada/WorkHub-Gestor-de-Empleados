-- T13: Employee offboarding — add nullable offboarded_at column.
-- Applied as manual SQL because PG16 + Prisma migrate dev hits P1010 (schema
-- ownership). The migration is idempotent on re-runs against an already-patched DB.

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "offboarded_at" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "employees_offboarded_at_idx" ON "employees" ("offboarded_at");
