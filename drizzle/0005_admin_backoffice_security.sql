CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "action" VARCHAR(96) NOT NULL,
  "actor" VARCHAR(96) NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT FALSE,
  "reason" VARCHAR(191),
  "ip_hash" VARCHAR(64),
  "user_agent_hash" VARCHAR(64),
  "target_type" VARCHAR(64),
  "target_id" VARCHAR(191),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_idx"
  ON "admin_audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_created_idx"
  ON "admin_audit_logs" ("action", "created_at");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_actor_created_idx"
  ON "admin_audit_logs" ("actor", "created_at");
