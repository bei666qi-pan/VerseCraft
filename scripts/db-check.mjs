#!/usr/bin/env node
import path from "node:path";
import { config as dotenvConfig } from "dotenv";
import pg from "pg";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

const url = process.env.DATABASE_URL?.replace(/^['"]|['"]$/g, "").trim();
if (!url) {
  console.error("[db:check] DATABASE_URL is missing. Check .env.local");
  process.exit(1);
}

const { Client } = pg;
const client = new Client({ connectionString: url });

const required = [
  "users",
  "feedbacks",
  "save_slots",
  "users_quota",
  "admin_stats_snapshots",
];

async function main() {
  await client.connect();
  const r1 = await client.query("select 1 as ok");
  console.log("[db:check] connect_ok =", r1.rows?.[0]?.ok);

  const q =
    "select tablename from pg_tables where schemaname='public' and tablename = any($1::text[]) order by tablename";
  const r2 = await client.query(q, [required]);
  const present = new Set(r2.rows.map((x) => x.tablename));
  const missing = required.filter((t) => !present.has(t));

  console.log("[db:check] tables_present =", Array.from(present.values()));
  if (missing.length) {
    console.error("[db:check] tables_missing =", missing);
    process.exitCode = 2;
  } else {
    console.log("[db:check] all_required_tables_present = true");
  }
}

main()
  .catch((e) => {
    console.error("[db:check] connect_failed =", e?.code || "", e?.message || String(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await client.end();
    } catch {}
  });

