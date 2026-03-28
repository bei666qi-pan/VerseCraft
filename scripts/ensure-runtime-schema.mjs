#!/usr/bin/env node
/**
 * Widens game_records.survival_time_seconds to INTEGER (fixes SMALLINT overflow, e.g. 133200s).
 *
 * Full table bootstrap still runs via Next.js `src/instrumentation.ts` → ensureRuntimeSchema()
 * on server start. Use this script on hosts that never run instrumentation or need a one-off ALTER.
 *
 * Manual SQL (same effect):
 *   ALTER TABLE game_records
 *   ALTER COLUMN survival_time_seconds TYPE INTEGER
 *   USING survival_time_seconds::integer;
 */
import path from "node:path";
import { config as dotenvConfig } from "dotenv";
import pg from "pg";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: path.resolve(process.cwd(), ".env") });

const url = process.env.DATABASE_URL?.replace(/^['"]|['"]$/g, "").trim();
if (!url) {
  console.error("[db:ensure-schema] DATABASE_URL is missing (.env.local / .env)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query(`
    ALTER TABLE game_records
    ALTER COLUMN survival_time_seconds TYPE INTEGER
    USING survival_time_seconds::integer;
  `);
  console.log(
    JSON.stringify({
      ok: true,
      stage: "game_records.survival_time_seconds_integer",
      ts: new Date().toISOString(),
    })
  );
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/does not exist/i.test(msg)) {
    console.warn(
      JSON.stringify({
        ok: false,
        skipped: true,
        reason: "game_records missing — run app/migrate once or start Next to run ensureRuntimeSchema",
        ts: new Date().toISOString(),
      })
    );
    process.exitCode = 0;
  } else {
    console.error(
      JSON.stringify({
        ok: false,
        stage: "game_records.alter_failed",
        ts: new Date().toISOString(),
        error: msg,
      })
    );
    process.exitCode = 1;
  }
} finally {
  await client.end().catch(() => {});
}
