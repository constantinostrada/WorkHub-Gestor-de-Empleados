-- T17: Webhook subscription system — register outbound subscribers.
-- Applied as manual SQL because PG16 + Prisma migrate dev hits P1010 (schema
-- ownership). Idempotent on re-runs against an already-patched DB.

CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "callback_url" TEXT NOT NULL,
    "events" TEXT[] NOT NULL,
    "secret" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);
