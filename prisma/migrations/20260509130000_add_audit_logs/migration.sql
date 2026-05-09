-- AuditLog: append-only audit trail of mutations.
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "details_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
CREATE INDEX "audit_logs_actor_id_idx"  ON "audit_logs" ("actor_id");
CREATE INDEX "audit_logs_action_idx"    ON "audit_logs" ("action");
