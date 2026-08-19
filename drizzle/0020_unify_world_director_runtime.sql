-- Phase 1: additive scope/idempotency columns and Dark Moon-only legacy backfill.
ALTER TABLE "vc_jobs" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "vc_jobs_type_idempotency_unique"
  ON "vc_jobs" ("job_type", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "world_engine_runs" ADD COLUMN IF NOT EXISTS "world_id" varchar(64);
ALTER TABLE "world_engine_runs" ADD COLUMN IF NOT EXISTS "map_id" varchar(64);
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "world_id" varchar(64);
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "map_id" varchar(64);
ALTER TABLE "world_engine_agenda_snapshots" ADD COLUMN IF NOT EXISTS "world_id" varchar(64);
ALTER TABLE "world_engine_agenda_snapshots" ADD COLUMN IF NOT EXISTS "map_id" varchar(64);
ALTER TABLE "world_engine_director_state" ADD COLUMN IF NOT EXISTS "world_id" varchar(64);
ALTER TABLE "world_engine_director_state" ADD COLUMN IF NOT EXISTS "map_id" varchar(64);
ALTER TABLE "npc_agent_state" ADD COLUMN IF NOT EXISTS "world_id" varchar(64);
ALTER TABLE "npc_agent_state" ADD COLUMN IF NOT EXISTS "map_id" varchar(64);

UPDATE "world_engine_runs" SET "world_id" = 'dark_moon_prologue', "map_id" = 'dark_moon_apartment'
WHERE "world_id" IS NULL OR "map_id" IS NULL;
UPDATE "world_engine_event_queue" SET "world_id" = 'dark_moon_prologue', "map_id" = 'dark_moon_apartment'
WHERE "world_id" IS NULL OR "map_id" IS NULL;
UPDATE "world_engine_agenda_snapshots" SET "world_id" = 'dark_moon_prologue', "map_id" = 'dark_moon_apartment'
WHERE "world_id" IS NULL OR "map_id" IS NULL;
UPDATE "world_engine_director_state" SET "world_id" = 'dark_moon_prologue', "map_id" = 'dark_moon_apartment'
WHERE "world_id" IS NULL OR "map_id" IS NULL;
UPDATE "npc_agent_state" SET "world_id" = 'dark_moon_prologue', "map_id" = 'dark_moon_apartment'
WHERE "world_id" IS NULL OR "map_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "world_engine_runs_scope_dedup_unique"
  ON "world_engine_runs" ("world_id", "map_id", "session_id", "dedup_key");
CREATE INDEX IF NOT EXISTS "world_engine_runs_scope_session_created_idx"
  ON "world_engine_runs" ("world_id", "map_id", "session_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "world_engine_director_state_scope_session_unique"
  ON "world_engine_director_state" ("world_id", "map_id", "session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "npc_agent_state_scope_session_npc_unique"
  ON "npc_agent_state" ("world_id", "map_id", "session_id", "npc_id");
CREATE INDEX IF NOT EXISTS "npc_agent_state_scope_status_eligible_idx"
  ON "npc_agent_state" ("world_id", "map_id", "session_id", "status", "next_eligible_turn");
CREATE UNIQUE INDEX IF NOT EXISTS "world_engine_event_queue_scope_director_dedup_unique"
  ON "world_engine_event_queue" ("world_id", "map_id", "session_id", "event_code", "dedup_key");
CREATE INDEX IF NOT EXISTS "world_engine_event_queue_scope_status_due_idx"
  ON "world_engine_event_queue" ("world_id", "map_id", "session_id", "status", "due_in_turns");
CREATE INDEX IF NOT EXISTS "world_engine_event_queue_scope_director_due_idx"
  ON "world_engine_event_queue" ("world_id", "map_id", "session_id", "status", "due_turn_index");
CREATE UNIQUE INDEX IF NOT EXISTS "world_engine_agenda_scope_revision_unique"
  ON "world_engine_agenda_snapshots" ("world_id", "map_id", "session_id", "agenda_revision");
CREATE INDEX IF NOT EXISTS "world_engine_agenda_scope_created_idx"
  ON "world_engine_agenda_snapshots" ("world_id", "map_id", "session_id", "created_at");

CREATE TABLE IF NOT EXISTS "world_engine_hint_envelopes" (
  "id" serial PRIMARY KEY,
  "hint_id" varchar(128) NOT NULL UNIQUE,
  "run_id" integer NOT NULL REFERENCES "world_engine_runs"("run_id") ON DELETE CASCADE,
  "world_id" varchar(64) NOT NULL,
  "map_id" varchar(64) NOT NULL,
  "session_id" varchar(191) NOT NULL,
  "world_revision" bigint NOT NULL,
  "valid_from_turn" integer NOT NULL,
  "valid_through_turn" integer NOT NULL,
  "phase" varchar(24) NOT NULL,
  "envelope_json" jsonb NOT NULL,
  "lifecycle" varchar(24) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "world_engine_hint_envelopes_scope_turn_idx"
  ON "world_engine_hint_envelopes" ("world_id", "map_id", "session_id", "lifecycle", "valid_from_turn", "valid_through_turn");
