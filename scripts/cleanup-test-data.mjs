#!/usr/bin/env node

import { mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { Client } from "pg";
import { TEST_DATA_MARKER_SOURCE } from "./cleanup-test-data-policy.mjs";

const MARKER = TEST_DATA_MARKER_SOURCE;
const apply = process.argv.includes("--apply");
const backupArg = process.argv.find((arg) => arg.startsWith("--backup-dir="));
const databaseUrl = String(process.env.DATABASE_URL ?? "").replace(/^['"]|['"]$/g, "").trim();

if (!databaseUrl) throw new Error("DATABASE_URL is required");

function createBackup() {
  if (!apply) return null;
  if (!backupArg) throw new Error("--apply requires --backup-dir=<existing secure directory>");
  const backupDir = resolve(backupArg.slice("--backup-dir=".length));
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(backupDir, `versecraft-before-test-cleanup-${stamp}.dump`);
  const dump = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--file", path, databaseUrl], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (dump.status !== 0) throw new Error("pg_dump failed; cleanup was not started");
  if (statSync(path).size <= 0) throw new Error("pg_dump produced an empty backup");
  return path;
}

async function tableExists(client, table) {
  const result = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [`public.${table}`]);
  return result.rows[0]?.present === true;
}

async function columnExists(client, table, column) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return result.rowCount > 0;
}

async function deleteMarkedRows(client, table, columns) {
  if (!(await tableExists(client, table))) return 0;
  const existing = [];
  for (const column of columns) {
    if (await columnExists(client, table, column)) existing.push(column);
  }
  if (existing.length === 0) return 0;
  const predicates = existing.map((column) => {
    if (column === "user_id") return `${column} IN (SELECT id FROM cleanup_users)`;
    if (column === "actor_id") return `${column} IN (SELECT actor_id FROM cleanup_actors)`;
    if (column === "guest_id") return `${column} IN (SELECT guest_id FROM cleanup_guests)`;
    return `${column} IN (SELECT session_id FROM cleanup_sessions)`;
  });
  const result = await client.query(`DELETE FROM ${table} WHERE ${predicates.join(" OR ")}`);
  return result.rowCount ?? 0;
}

const backupPath = createBackup();
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(
    `CREATE TEMP TABLE cleanup_users ON COMMIT DROP AS
     SELECT id FROM users WHERE name ~* $1`,
    [MARKER],
  );
  await client.query(
    `CREATE TEMP TABLE cleanup_sessions (session_id varchar(191) PRIMARY KEY) ON COMMIT DROP`,
  );
  if (await tableExists(client, "actor_sessions")) {
    await client.query(
      `INSERT INTO cleanup_sessions(session_id)
       SELECT session_id FROM actor_sessions
       WHERE user_id IN (SELECT id FROM cleanup_users) OR session_id ~* $1
       ON CONFLICT DO NOTHING`,
      [MARKER],
    );
  }
  if (await tableExists(client, "analytics_events")) {
    await client.query(
      `INSERT INTO cleanup_sessions(session_id)
       SELECT DISTINCT session_id FROM analytics_events
       WHERE user_id IN (SELECT id FROM cleanup_users) OR session_id ~* $1
       ON CONFLICT DO NOTHING`,
      [MARKER],
    );
  }
  await client.query(
    `CREATE TEMP TABLE cleanup_guests (guest_id varchar(128) PRIMARY KEY) ON COMMIT DROP`,
  );
  for (const table of ["guest_registry", "guest_sessions", "analytics_events", "actor_sessions"]) {
    if (!(await tableExists(client, table)) || !(await columnExists(client, table, "guest_id"))) continue;
    await client.query(
      `INSERT INTO cleanup_guests(guest_id)
       SELECT DISTINCT guest_id FROM ${table}
       WHERE guest_id IS NOT NULL AND guest_id ~* $1
       ON CONFLICT DO NOTHING`,
      [MARKER],
    );
  }
  await client.query(
    `CREATE TEMP TABLE cleanup_actors (actor_id varchar(191) PRIMARY KEY) ON COMMIT DROP`,
  );
  if (await tableExists(client, "analytics_actors")) {
    await client.query(
      `INSERT INTO cleanup_actors(actor_id)
       SELECT actor_id FROM analytics_actors
       WHERE user_id IN (SELECT id FROM cleanup_users)
          OR guest_id IN (SELECT guest_id FROM cleanup_guests)
          OR actor_id ~* $1
       ON CONFLICT DO NOTHING`,
      [MARKER],
    );
  }

  const candidateCounts = await client.query(
    `SELECT
       (SELECT COUNT(*) FROM cleanup_users)::int AS users,
       (SELECT COUNT(*) FROM cleanup_sessions)::int AS sessions,
       (SELECT COUNT(*) FROM cleanup_guests)::int AS guests,
       (SELECT COUNT(*) FROM cleanup_actors)::int AS actors`,
  );

  const deleted = {};
  if (apply) {
    // AI usage and compliance/audit ledgers are deliberately absent here.
    const sessionScoped = [
      "world_engine_event_queue",
      "world_engine_runs",
      "world_engine_director_state",
      "npc_agent_state",
      "npc_relation_edges",
      "social_event_ledger",
      "story_events",
      "narrative_runs",
      "narrative_pacing_ledger",
      "narrative_foreshadow_ledger",
      "analytics_events",
      "presence_heartbeat_dedupe",
      "guest_sessions",
      "actor_sessions",
    ];
    for (const table of sessionScoped) {
      deleted[table] = await deleteMarkedRows(client, table, ["session_id", "user_id", "guest_id", "actor_id"]);
    }
    for (const table of ["actor_daily_activity", "actor_daily_tokens", "analytics_actors", "guest_aliases", "guest_registry"]) {
      deleted[table] = await deleteMarkedRows(client, table, ["user_id", "guest_id", "actor_id"]);
    }
    if (await tableExists(client, "vc_jobs")) {
      const jobs = await client.query(
        `DELETE FROM vc_jobs
         WHERE payload->>'sessionId' IN (SELECT session_id FROM cleanup_sessions)
            OR payload->>'session_id' IN (SELECT session_id FROM cleanup_sessions)`,
      );
      deleted.vc_jobs = jobs.rowCount ?? 0;
    }
    const users = await client.query("DELETE FROM users WHERE id IN (SELECT id FROM cleanup_users)");
    deleted.users = users.rowCount ?? 0;
    if (await tableExists(client, "admin_audit_logs")) {
      await client.query(
        `INSERT INTO admin_audit_logs(action, actor, success, reason, metadata)
         VALUES ('cleanup_test_data', 'system:cleanup-test-data', true, NULL, $1::jsonb)`,
        [JSON.stringify({ marker: MARKER, candidates: candidateCounts.rows[0], deleted, backupPath })],
      );
    }
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }

  console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", backupPath, candidates: candidateCounts.rows[0], deleted }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
