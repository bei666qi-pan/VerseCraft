-- Player Echo Canon persistence. Additive and disabled by rollout flags until wired.
CREATE TABLE IF NOT EXISTS "player_echo_canon" (
  "user_id" VARCHAR(191) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "total_runs" INTEGER NOT NULL DEFAULT 0,
  "total_deaths" INTEGER NOT NULL DEFAULT 0,
  "endings_seen" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "highest_floor_score" INTEGER NOT NULL DEFAULT 0,
  "repeated_death_causes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "recurring_npc_bonds" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "unresolved_regrets" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "strongest_choices" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "stable_echo_summary" TEXT NOT NULL DEFAULT '',
  "last_run_summary" TEXT NOT NULL DEFAULT '',
  "echo_intensity" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "player_echo_events" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" VARCHAR(191) REFERENCES "users"("id") ON DELETE CASCADE,
  "run_id" VARCHAR(191),
  "event_type" VARCHAR(64),
  "target_type" VARCHAR(32),
  "target_id" VARCHAR(128),
  "summary" TEXT NOT NULL,
  "emotional_weight" INTEGER NOT NULL DEFAULT 50,
  "safety_level" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "player_echo_events_user_created_idx"
  ON "player_echo_events" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "player_echo_events_target_idx"
  ON "player_echo_events" ("target_type", "target_id");
