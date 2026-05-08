-- Social World Engine persistence: additive per-session snapshots and event ledger.
CREATE TABLE IF NOT EXISTS "npc_agent_state" (
  "id" SERIAL PRIMARY KEY,
  "session_id" VARCHAR(191) NOT NULL,
  "user_id" VARCHAR(191) REFERENCES "users"("id") ON DELETE SET NULL,
  "npc_id" VARCHAR(128) NOT NULL,
  "state_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" VARCHAR(24) NOT NULL DEFAULT 'idle',
  "last_active_turn" INTEGER NOT NULL DEFAULT 0,
  "next_eligible_turn" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "npc_agent_state_session_npc_unique"
  ON "npc_agent_state" ("session_id", "npc_id");
CREATE INDEX IF NOT EXISTS "npc_agent_state_session_status_eligible_idx"
  ON "npc_agent_state" ("session_id", "status", "next_eligible_turn");
CREATE INDEX IF NOT EXISTS "npc_agent_state_user_updated_idx"
  ON "npc_agent_state" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "npc_relation_edges" (
  "id" SERIAL PRIMARY KEY,
  "session_id" VARCHAR(191) NOT NULL,
  "user_id" VARCHAR(191) REFERENCES "users"("id") ON DELETE SET NULL,
  "from_npc_id" VARCHAR(128) NOT NULL,
  "to_npc_id" VARCHAR(128) NOT NULL,
  "edge_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "npc_relation_edges_session_edge_unique"
  ON "npc_relation_edges" ("session_id", "from_npc_id", "to_npc_id");
CREATE INDEX IF NOT EXISTS "npc_relation_edges_session_from_idx"
  ON "npc_relation_edges" ("session_id", "from_npc_id");
CREATE INDEX IF NOT EXISTS "npc_relation_edges_session_to_idx"
  ON "npc_relation_edges" ("session_id", "to_npc_id");

CREATE TABLE IF NOT EXISTS "social_event_ledger" (
  "id" BIGSERIAL PRIMARY KEY,
  "session_id" VARCHAR(191) NOT NULL,
  "user_id" VARCHAR(191) REFERENCES "users"("id") ON DELETE SET NULL,
  "event_id" VARCHAR(128) NOT NULL,
  "event_type" VARCHAR(32) NOT NULL,
  "actor_key" VARCHAR(512) NOT NULL,
  "target_key" VARCHAR(512) NOT NULL,
  "dedup_key" VARCHAR(191) NOT NULL,
  "turn_index" INTEGER NOT NULL DEFAULT 0,
  "due_turn_index" INTEGER NOT NULL DEFAULT 0,
  "expires_turn_index" INTEGER,
  "visibility" VARCHAR(32) NOT NULL,
  "player_relevance" VARCHAR(16) NOT NULL,
  "escape_relevance" VARCHAR(24) NOT NULL DEFAULT 'none',
  "knowledge_scope" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'candidate',
  "event_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "projected_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_event_ledger_dedup_unique"
  ON "social_event_ledger" ("session_id", "event_type", "actor_key", "target_key", "dedup_key");
CREATE INDEX IF NOT EXISTS "social_event_ledger_prompt_due_idx"
  ON "social_event_ledger" ("session_id", "status", "visibility", "player_relevance", "due_turn_index");
CREATE INDEX IF NOT EXISTS "social_event_ledger_session_event_idx"
  ON "social_event_ledger" ("session_id", "event_id");
CREATE INDEX IF NOT EXISTS "social_event_ledger_session_expires_idx"
  ON "social_event_ledger" ("session_id", "status", "expires_turn_index");
