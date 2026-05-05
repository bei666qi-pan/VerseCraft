import "dotenv/config";
import { Client } from "pg";

type BaselineQuery = {
  name: string;
  sql: string;
  thresholdMs: number;
};

const QUERIES: BaselineQuery[] = [
  {
    name: "realtime_active_sessions",
    thresholdMs: 120,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        COUNT(*)::int AS active_sessions,
        COALESCE(AVG(EXTRACT(EPOCH FROM (last_seen_at - started_at))), 0)::int AS avg_session_duration_sec
      FROM user_sessions
      WHERE last_seen_at >= NOW() - (10 * INTERVAL '1 minute');
    `,
  },
  {
    name: "latest_feedback_distinct_on",
    thresholdMs: 180,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT DISTINCT ON (user_id)
        user_id, content, created_at
      FROM feedbacks
      ORDER BY user_id, created_at DESC;
    `,
  },
  {
    name: "latest_settlement_distinct_on",
    thresholdMs: 180,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT DISTINCT ON (user_id)
        user_id, max_floor_score, survival_time_seconds, created_at
      FROM settlement_histories
      ORDER BY user_id, created_at DESC;
    `,
  },
  {
    name: "events_trend_60m",
    thresholdMs: 120,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        COUNT(*) FILTER (WHERE event_time >= NOW() - INTERVAL '5 minutes') AS m5,
        COUNT(*) FILTER (WHERE event_time >= NOW() - INTERVAL '15 minutes') AS m15,
        COUNT(*) FILTER (WHERE event_time >= NOW() - INTERVAL '60 minutes') AS m60
      FROM analytics_events
      WHERE event_time >= NOW() - INTERVAL '60 minutes';
    `,
  },
  {
    name: "funnel_grouped",
    thresholdMs: 300,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT event_name, COUNT(DISTINCT COALESCE(actor_id, user_id, guest_id, session_id))
      FROM analytics_events
      WHERE event_time >= NOW() - INTERVAL '7 days'
        AND event_name IN (
          'home_viewed','world_selected','character_create_started','character_create_success',
          'create_character_success','enter_main_game','first_effective_action',
          'third_effective_action','save_created','settlement_submitted',
          'game_settlement','feedback_submitted'
        )
      GROUP BY event_name;
    `,
  },
  {
    name: "ai_experience_latency",
    thresholdMs: 300,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN payload->>'firstTokenMs' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (payload->>'firstTokenMs')::double precision END) AS ttft_p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY CASE WHEN payload->>'firstTokenMs' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (payload->>'firstTokenMs')::double precision END) AS ttft_p95,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN payload->>'totalLatencyMs' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (payload->>'totalLatencyMs')::double precision END) AS total_p50,
        SUM(token_cost) AS tokens
      FROM analytics_events
      WHERE event_time >= NOW() - INTERVAL '7 days'
        AND event_name IN ('chat_request_finished','chat_action_completed','chat_action_failed');
    `,
  },
  {
    name: "users_page_registered",
    thresholdMs: 250,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT id, name, tokens_used, play_time, last_active
      FROM users
      WHERE last_active IS NOT NULL
      ORDER BY last_active DESC
      LIMIT 20;
    `,
  },
  {
    name: "audit_logs_recent",
    thresholdMs: 150,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT id, action, actor, success, created_at
      FROM admin_audit_logs
      ORDER BY created_at DESC, id DESC
      LIMIT 50;
    `,
  },
];

function parseExecutionMs(planLines: string[]): number {
  const line = planLines.find((x) => x.includes("Execution Time"));
  if (!line) return Number.POSITIVE_INFINITY;
  const m = line.match(/Execution Time:\s*([\d.]+)\s*ms/i);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

async function main() {
  const strict = process.argv.includes("--strict");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[admin-explain-baseline] missing DATABASE_URL");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  let exceeded = 0;

  try {
    for (const q of QUERIES) {
      const res = await client.query(q.sql);
      const lines = res.rows.map((r) => String(r["QUERY PLAN"] ?? ""));
      const ms = parseExecutionMs(lines);
      const pass = Number.isFinite(ms) && ms <= q.thresholdMs;
      if (!pass) exceeded += 1;
      console.log(`\n[${q.name}] ${ms.toFixed(2)} ms (threshold ${q.thresholdMs} ms) ${pass ? "OK" : "SLOW"}`);
      const keyLines = lines.filter((l) => l.includes("Seq Scan") || l.includes("Index") || l.includes("Execution Time"));
      for (const line of keyLines.slice(0, 8)) console.log(`  ${line}`);
    }
  } finally {
    await client.end();
  }

  if (strict && exceeded > 0) {
    console.error(`\n[admin-explain-baseline] failed: ${exceeded} queries exceed threshold`);
    process.exit(2);
  }
  console.log(`\n[admin-explain-baseline] completed, exceeded=${exceeded}`);
}

void main();

