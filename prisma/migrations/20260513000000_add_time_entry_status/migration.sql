-- T14: TimeEntry approval workflow — add status enum + approve/reject columns.
-- Manual SQL because PG16 + Prisma migrate dev hits P1010 (schema ownership).

-- 1. Create the new enum type used for time_entries.status
CREATE TYPE "time_entry_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- 2. Add the columns. Existing rows pick up status='PENDING' (default).
ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "status"           "time_entry_status" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "approved_at"      TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS "approved_by"      TEXT NULL,
  ADD COLUMN IF NOT EXISTS "rejected_at"      TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS "rejected_by"      TEXT NULL,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT NULL;

-- 3. Index status for filter queries (?status=PENDING|APPROVED|REJECTED).
CREATE INDEX IF NOT EXISTS "time_entries_status_idx" ON "time_entries"("status");
