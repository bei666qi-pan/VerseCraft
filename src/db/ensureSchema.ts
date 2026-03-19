import "server-only";

import { pool } from "@/db/index";
import { env } from "@/lib/env";

let ensured = false;

/**
 * Coolify/first-boot safety net.
 * If Drizzle migrations weren't applied yet, create the minimal tables used at runtime.
 * This is idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
 */
export async function ensureRuntimeSchema(): Promise<void> {
  if (ensured) return;
  ensured = true;

  // Allow disabling in production if you manage migrations externally.
  if (env.runtimeSchemaEnsure === "0") return;

  const client = await pool.connect();
  try {
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
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_name_unique ON users (name);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS feedbacks (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
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
  } finally {
    client.release();
  }
}

