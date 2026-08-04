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

// 注：user_sessions / user_daily_activity / user_daily_tokens 已被 T8 方案B（2026-07）
// 下线，全仓确认没有任何写入路径（见 src/lib/analytics/repository.ts 注释与
// recordChatActionCompletedAnalytics 实现），继续把它们列为 required 只会检查一张
// 冻结不再更新的旧表，不代表任何真实健康信号，因此移除；改为检查实际承载读写的
// analytics_actors / actor_sessions / actor_daily_activity / actor_daily_tokens /
// guest_registry。
const required = [
  "users",
  "feedbacks",
  "survey_responses",
  "save_slots",
  "users_quota",
  "admin_stats_snapshots",
  "analytics_events",
  "analytics_actors",
  "actor_sessions",
  "actor_daily_activity",
  "actor_daily_tokens",
  "guest_registry",
  "admin_metrics_daily",
  "web_traffic_daily",
  "settlement_histories",
];
const kgRequired = [
  "vc_world_meta",
  "vc_world_fact",
  "vc_world_candidate",
  "vc_world_cluster",
  "vc_cluster_observation",
  "vc_semantic_cache",
  "vc_jobs",
];

async function main() {
  await client.connect();
  const r1 = await client.query("select 1 as ok");
  console.log("[db:check] connect_ok =", r1.rows?.[0]?.ok);

  const checkKg = process.env.VC_CHECK_KG_SCHEMA === "1";
  const expected = checkKg ? [...required, ...kgRequired] : required;
  const q =
    "select tablename from pg_tables where schemaname='public' and tablename = any($1::text[]) order by tablename";
  const r2 = await client.query(q, [expected]);
  const present = new Set(r2.rows.map((x) => x.tablename));
  const missing = expected.filter((t) => !present.has(t));

  console.log("[db:check] tables_present =", Array.from(present.values()));
  if (checkKg) {
    const ext = await client.query(
      "select exists(select 1 from pg_extension where extname='vector') as has_vector"
    );
    console.log("[db:check] vector_extension =", Boolean(ext.rows?.[0]?.has_vector));
  }
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
