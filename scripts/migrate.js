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

async function main() {
  const url = getDatabaseUrl();
  const client = new Client({ connectionString: url });

  const start = Date.now();
  await client.connect();
  try {
    await ensureMigrationsTable(client);

    const name = "schema_v1";
    const already = await hasMigration(client, name);
    if (already) {
      console.log(`[migrate] ${name} already applied`);
      return;
    }

    console.log(`[migrate] applying ${name} ...`);
    await applySchemaV1(client);
    await markMigration(client, name);
    console.log(`[migrate] applied ${name} in ${Date.now() - start}ms`);
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

