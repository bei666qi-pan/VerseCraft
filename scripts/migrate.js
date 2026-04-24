/* scripts/migrate.js */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const { Client } = require("pg");

function getDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not configured");
  }
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _vc_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function hasMigration(client, name) {
  const r = await client.query(`SELECT 1 FROM _vc_migrations WHERE name = $1 LIMIT 1;`, [name]);
  return r.rowCount > 0;
}

async function markMigration(client, name) {
  await client.query(`INSERT INTO _vc_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING;`, [name]);
}

/**
 * Idempotent analytics tables — run on every boot as well as inside schema_v1.
 * Older deployments may have `schema_v1` marked applied before `analytics_events` existed.
 */
async function ensureAnalyticsFoundationTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      event_id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id VARCHAR(191) NOT NULL,
      event_name VARCHAR(64) NOT NULL,
      event_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      page TEXT NULL,
      source TEXT NULL,
      platform TEXT NULL,
      token_cost INTEGER NOT NULL DEFAULT 0,
      play_duration_delta_sec INTEGER NOT NULL DEFAULT 0,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      idempotency_key VARCHAR(191) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS analytics_events_user_event_time_idx ON analytics_events (user_id, event_time);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS analytics_events_event_name_event_time_idx ON analytics_events (event_name, event_time);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx ON analytics_events (session_id);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS analytics_events_page_time_idx ON analytics_events (page, event_time);
  `);
}

async function ensurePresencePlaytimeTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS guest_sessions (
      session_id VARCHAR(191) PRIMARY KEY,
      guest_id VARCHAR(128) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_page TEXT NULL,
      total_play_duration_sec INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS guest_sessions_guest_last_seen_idx ON guest_sessions (guest_id, last_seen_at);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS guest_sessions_last_seen_at_idx ON guest_sessions (last_seen_at);
  `);
  await client.query(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_presence_ok_at TIMESTAMPTZ NULL;`);
  await client.query(`ALTER TABLE guest_sessions ADD COLUMN IF NOT EXISTS last_presence_ok_at TIMESTAMPTZ NULL;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS guest_registry (
      guest_id VARCHAR(128) PRIMARY KEY,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total_play_duration_sec INTEGER NOT NULL DEFAULT 0,
      ua TEXT,
      ip_hash VARCHAR(64),
      platform VARCHAR(32) NOT NULL DEFAULT 'unknown',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS guest_registry_last_seen_at_idx ON guest_registry (last_seen_at);
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS guest_daily_activity (
      guest_id VARCHAR(128) NOT NULL,
      date_key DATE NOT NULL,
      first_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      chat_action_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guest_id, date_key)
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS guest_daily_activity_date_key_idx ON guest_daily_activity (date_key);
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS guest_daily_tokens (
      guest_id VARCHAR(128) NOT NULL,
      date_key DATE NOT NULL,
      daily_token_cost INTEGER NOT NULL DEFAULT 0,
      daily_play_duration_sec INTEGER NOT NULL DEFAULT 0,
      chat_action_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guest_id, date_key)
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS guest_daily_tokens_date_key_idx ON guest_daily_tokens (date_key);
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS presence_heartbeat_dedupe (
      session_id VARCHAR(191) NOT NULL,
      bucket_start TIMESTAMPTZ NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT presence_heartbeat_session_bucket_unique UNIQUE (session_id, bucket_start)
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS presence_heartbeat_session_event_time_idx
    ON presence_heartbeat_dedupe (session_id, event_time);
  `);
}

async function applySchemaV1(client) {
  // Minimal idempotent schema to prevent runtime "relation does not exist".
  // This is NOT a replacement for Drizzle migrations, but a safety net for first boot on Coolify.
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      today_tokens_used INTEGER NOT NULL DEFAULT 0,
      play_time INTEGER NOT NULL DEFAULT 0,
      today_play_time INTEGER NOT NULL DEFAULT 0,
      last_data_reset TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_active TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_name_unique ON users (name);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS game_records (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      killed_anomalies INTEGER NOT NULL DEFAULT 0,
      max_floor_score INTEGER NOT NULL DEFAULT 0,
      survival_time_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS game_session_memory (
      user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      plot_summary TEXT,
      player_status JSONB,
      npc_relationships JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_onboarding (
      user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      codex_first_view_done INTEGER NOT NULL DEFAULT 0,
      warehouse_first_view_done INTEGER NOT NULL DEFAULT 0,
      tasks_first_view_done INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS users_quota (
      user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      daily_tokens INTEGER NOT NULL DEFAULT 0,
      daily_actions INTEGER NOT NULL DEFAULT 0,
      last_action_date DATE NOT NULL DEFAULT CURRENT_DATE,
      is_banned BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS save_slots (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot_id VARCHAR(64) NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS save_slots_user_slot_unique ON save_slots (user_id, slot_id);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_stats_snapshots (
      date DATE PRIMARY KEY,
      total_users INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      active_users INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========= Analytics Data Foundation =========
  await ensureAnalyticsFoundationTables(client);

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_page TEXT NULL,
      total_token_cost INTEGER NOT NULL DEFAULT 0,
      total_play_duration_sec INTEGER NOT NULL DEFAULT 0,
      chat_action_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS user_sessions_user_last_seen_idx ON user_sessions (user_id, last_seen_at);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS user_sessions_last_seen_at_idx ON user_sessions (last_seen_at);
  `);
  await ensurePresencePlaytimeTables(client);

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_daily_activity (
      user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date_key DATE NOT NULL,
      first_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      chat_action_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date_key)
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS user_daily_activity_date_key_idx ON user_daily_activity (date_key);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_daily_tokens (
      user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date_key DATE NOT NULL,
      daily_token_cost INTEGER NOT NULL DEFAULT 0,
      daily_play_duration_sec INTEGER NOT NULL DEFAULT 0,
      chat_action_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date_key)
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS user_daily_tokens_date_key_idx ON user_daily_tokens (date_key);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_metrics_daily (
      date_key DATE PRIMARY KEY,
      dau INTEGER NOT NULL DEFAULT 0,
      wau INTEGER NOT NULL DEFAULT 0,
      mau INTEGER NOT NULL DEFAULT 0,
      new_users INTEGER NOT NULL DEFAULT 0,
      total_token_cost INTEGER NOT NULL DEFAULT 0,
      total_play_duration_sec INTEGER NOT NULL DEFAULT 0,
      chat_actions INTEGER NOT NULL DEFAULT 0,
      feedback_submitted_count INTEGER NOT NULL DEFAULT 0,
      game_completed_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS admin_metrics_daily_date_key_idx ON admin_metrics_daily (date_key);
  `);
}

/**
 * KG：pgvector + IVFFlat 语义缓存与世界元数据（幂等）。
 * 无 pgvector 扩展时跳过（应用层对 42P01/缺扩展静默降级）。
 */
async function ensureKgSemanticLayer(client) {
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
  } catch (e) {
    console.warn("[migrate] CREATE EXTENSION vector skipped:", e?.message ?? e);
    return;
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS vc_world_meta (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      world_revision BIGINT NOT NULL DEFAULT 0
    );
  `);
  await client.query(`
    INSERT INTO vc_world_meta (id, world_revision) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS vc_semantic_cache (
      id BIGSERIAL PRIMARY KEY,
      cache_scope TEXT NOT NULL,
      task TEXT NOT NULL,
      user_id VARCHAR(191) REFERENCES users(id) ON DELETE CASCADE,
      world_revision BIGINT NOT NULL,
      request_embedding vector(256) NOT NULL,
      request_norm TEXT,
      request_text_preview TEXT,
      request_hash TEXT NOT NULL UNIQUE,
      response_text TEXT NOT NULL,
      is_valid BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      last_hit_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS vc_semantic_cache_ivfflat_global_codex
    ON vc_semantic_cache USING ivfflat (request_embedding vector_cosine_ops)
    WITH (lists = 100)
    WHERE cache_scope = 'global' AND is_valid = TRUE AND task = 'codex';
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS vc_user_fact (
      id BIGSERIAL PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fact_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS vc_user_fact_user_id_idx ON vc_user_fact (user_id);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS vc_world_candidate (
      id BIGSERIAL PRIMARY KEY,
      proposer_user_id VARCHAR(191) REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ghost',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Janitor / 共识 / 队列表（依赖 vector 扩展）。幂等 ALTER + CREATE。
 */
async function ensureKgWorkerLayer(client) {
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
  } catch (e) {
    console.warn("[migrate] ensureKgWorkerLayer: vector extension skipped:", e?.message ?? e);
    return;
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS vc_world_cluster (
      cluster_id BIGSERIAL PRIMARY KEY,
      centroid vector(256) NOT NULL,
      unique_user_count INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'open',
      promoted_fact_id BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS vc_world_cluster_ivfflat_centroid
    ON vc_world_cluster USING ivfflat (centroid vector_cosine_ops)
    WITH (lists = 100)
    WHERE state = 'open';
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS vc_world_fact (
      fact_id BIGSERIAL PRIMARY KEY,
      canonical_text TEXT NOT NULL,
      normalized_hash TEXT NOT NULL UNIQUE,
      embedding vector(256) NOT NULL,
      is_hot BOOLEAN NOT NULL DEFAULT TRUE,
      last_hit_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS vc_world_fact_ivfflat_hot
    ON vc_world_fact USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
    WHERE is_hot = TRUE;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS vc_cluster_observation (
      id BIGSERIAL PRIMARY KEY,
      cluster_id BIGINT NOT NULL REFERENCES vc_world_cluster(cluster_id) ON DELETE CASCADE,
      user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      candidate_id BIGINT REFERENCES vc_world_candidate(id) ON DELETE SET NULL,
      embedding vector(256) NOT NULL,
      similarity_to_centroid REAL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (cluster_id, user_id)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS vc_cluster_observation_cluster_idx ON vc_cluster_observation (cluster_id);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS vc_jobs (
      job_id BIGSERIAL PRIMARY KEY,
      job_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending',
      run_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 8,
      locked_at TIMESTAMPTZ,
      locked_by TEXT,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS vc_jobs_claim_idx
    ON vc_jobs (status, run_at, priority DESC, job_id);
  `);

  const candCols = [
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS janitor_status TEXT NOT NULL DEFAULT 'pending'",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS compliance_ok BOOLEAN",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS significance_score SMALLINT",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS janitor_action TEXT",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS canonical_text TEXT",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS normalized_text TEXT",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS janitor_violations JSONB",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS janitor_tags JSONB",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS janitor_model_meta JSONB",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS embedding vector(256)",
    "ALTER TABLE vc_world_candidate ADD COLUMN IF NOT EXISTS cluster_id BIGINT REFERENCES vc_world_cluster(cluster_id) ON DELETE SET NULL",
  ];
  for (const sql of candCols) {
    try {
      await client.query(sql);
    } catch (e) {
      console.warn("[migrate] vc_world_candidate alter skipped:", e?.message ?? e);
    }
  }
}

async function ensureKgSchemaV1(client) {
  // keep split functions for readability; unified entry for migration + reconcile.
  await ensureKgSemanticLayer(client);
  await ensureKgWorkerLayer(client);
}

async function main() {
  const url = getDatabaseUrl();
  const client = new Client({ connectionString: url });

  const start = Date.now();
  await client.connect();
  try {
    await ensureMigrationsTable(client);

    const name = "schema_v1";
    const already = await hasMigration(client, name);
    if (!already) {
      console.log(`[migrate] applying ${name} ...`);
      await applySchemaV1(client);
      await markMigration(client, name);
      console.log(`[migrate] applied ${name} in ${Date.now() - start}ms`);
    } else {
      console.log(`[migrate] ${name} already applied`);
    }

    // Reconcile analytics for DBs where schema_v1 predates analytics_events (migration row already set).
    await ensureAnalyticsFoundationTables(client);
    console.log("[migrate] ensureAnalyticsFoundationTables ok");
    await ensurePresencePlaytimeTables(client);
    console.log("[migrate] ensurePresencePlaytimeTables ok");

    const kgName = "kg_schema_v1";
    const kgApplied = await hasMigration(client, kgName);
    if (!kgApplied) {
      console.log(`[migrate] applying ${kgName} ...`);
      await ensureKgSchemaV1(client);
      await markMigration(client, kgName);
      console.log(`[migrate] applied ${kgName}`);
    } else {
      console.log(`[migrate] ${kgName} already applied`);
    }

    // Reconcile KG objects on every boot; idempotent and safe for drifted historical DBs.
    await ensureKgSchemaV1(client);
    console.log("[migrate] ensureKgSchemaV1 reconcile ok");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Do not crash hard if migration fails: let Next.js start and surface real error pages.
  // But print details so Coolify logs show the root cause.
  console.error("[migrate] failed", {
    message: err?.message,
    code: err?.code,
    detail: err?.detail,
    hint: err?.hint,
    stack: err?.stack,
  });
  process.exitCode = 0;
});

