-- World Director agenda lifecycle and per-session pacing state.
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "due_turn_index" INTEGER;
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "ttl_turns" INTEGER;
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "expires_turn_index" INTEGER;
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "injected_turn_index" INTEGER;
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "resolved_turn_index" INTEGER;
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "salience" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "agency_risk" VARCHAR(16);
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "continuity_risk" VARCHAR(16);
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "spoiler_risk" VARCHAR(16);
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "reveal_policy" VARCHAR(24);
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "injection_hint" TEXT;
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "agency_constraints" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "forbidden_outcomes" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "world_engine_event_queue" ADD COLUMN IF NOT EXISTS "dedup_key" VARCHAR(191);

CREATE INDEX IF NOT EXISTS "world_engine_event_queue_director_due_idx"
  ON "world_engine_event_queue" ("session_id", "status", "due_turn_index");

CREATE UNIQUE INDEX IF NOT EXISTS "world_engine_event_queue_director_dedup_unique"
  ON "world_engine_event_queue" ("session_id", "event_code", "dedup_key");

CREATE TABLE IF NOT EXISTS "world_engine_director_state" (
  "id" SERIAL PRIMARY KEY,
  "session_id" VARCHAR(191) NOT NULL,
  "user_id" VARCHAR(191) REFERENCES "users"("id") ON DELETE CASCADE,
  "turn_index" INTEGER NOT NULL DEFAULT 0,
  "phase" VARCHAR(24) NOT NULL DEFAULT 'quiet',
  "pacing_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "recent_director_intent" TEXT,
  "world_revision" BIGINT,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "world_engine_director_state_session_unique"
  ON "world_engine_director_state" ("session_id");
CREATE INDEX IF NOT EXISTS "world_engine_director_state_user_updated_idx"
  ON "world_engine_director_state" ("user_id", "updated_at");
