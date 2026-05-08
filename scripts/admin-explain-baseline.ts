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
    name: "event_health_event_coverage",
    thresholdMs: 450,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        event_name,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE actor_id IS NULL)::int AS missing_actor,
        COUNT(*) FILTER (WHERE session_id = 'anon_session')::int AS anon_session,
        COUNT(*) FILTER (WHERE platform IS NULL OR platform = 'unknown')::int AS unknown_platform
      FROM analytics_events
      WHERE event_time >= NOW() - INTERVAL '7 days'
        AND event_time <= NOW()
      GROUP BY event_name
      ORDER BY total DESC
      LIMIT 100;
    `,
  },
  {
    name: "strict_player_journey",
    thresholdMs: 650,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      WITH raw_events AS (
        SELECT
          CASE
            WHEN event_name = 'create_character_success' THEN 'character_create_success'
            WHEN event_name = 'game_settlement' THEN 'settlement_submitted'
            WHEN event_name IN ('save_sync', 'save_load') THEN 'save_created'
            ELSE event_name
          END AS stage,
          COALESCE(
            actor_id,
            CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id END,
            CASE WHEN guest_id IS NOT NULL AND btrim(guest_id::text) <> '' THEN 'g:' || guest_id END,
            session_id
          ) AS actor_key,
          event_time
        FROM analytics_events
        WHERE event_time >= NOW() - INTERVAL '7 days'
          AND event_time <= NOW()
          AND event_name IN (
            'home_viewed','world_selected','character_create_started','character_create_success','create_character_success',
            'enter_main_game','first_effective_action','third_effective_action','save_created','save_sync','save_load',
            'settlement_submitted','game_settlement','feedback_submitted'
          )
      ),
      normalized AS (
        SELECT stage, actor_key, MIN(event_time) AS first_at
        FROM raw_events
        GROUP BY stage, actor_key
      )
      SELECT stage, COUNT(*)::int AS actors, MIN(first_at) AS first_seen
      FROM normalized
      GROUP BY stage
      ORDER BY actors DESC;
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
    name: "content_quality_world_chapter_npc",
    thresholdMs: 650,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        event_name,
        COALESCE(NULLIF(payload->>'worldId', ''), NULLIF(payload->>'world', ''), NULLIF(payload->>'world_id', ''), 'unknown') AS world_id,
        COALESCE(NULLIF(payload->>'chapterId', ''), NULLIF(payload->>'chapter_id', ''), NULLIF(payload->>'currentChapterId', ''), NULLIF(payload->>'activeChapterId', ''), NULLIF(payload->>'chapter', ''), 'unknown') AS chapter_id,
        COALESCE(NULLIF(payload->>'npcId', ''), NULLIF(payload->>'npc_id', ''), NULLIF(payload->>'targetNpcId', ''), 'unknown') AS npc_id,
        COUNT(*)::int AS total
      FROM analytics_events
      WHERE event_time >= NOW() - INTERVAL '7 days'
        AND event_time <= NOW()
        AND event_name IN (
          'world_selected',
          'first_effective_action',
          'chapter_entered',
          'chapter_completed',
          'chapter_abandoned',
          'npc_interaction_started',
          'npc_interaction_completed',
          'npc_interaction_failed'
        )
      GROUP BY event_name, world_id, chapter_id, npc_id
      ORDER BY total DESC
      LIMIT 200;
    `,
  },
  {
    name: "content_quality_validator_retry",
    thresholdMs: 450,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        event_name,
        COALESCE(payload->>'issueCode', payload->>'code', 'unknown') AS issue_code,
        COUNT(*)::int AS total
      FROM analytics_events
      WHERE event_time >= NOW() - INTERVAL '7 days'
        AND event_time <= NOW()
        AND event_name IN (
          'narrative_validator_issue',
          'narrative_safety_issue',
          'entity_audit_issue',
          'pacing_validator_issue',
          'retry_clicked',
          'regen_clicked'
        )
      GROUP BY event_name, issue_code
      ORDER BY total DESC
      LIMIT 100;
    `,
  },
  {
    name: "survey_aggregate_recent",
    thresholdMs: 350,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        survey_key,
        COUNT(*)::int AS responses,
        COUNT(*) FILTER (WHERE overall_rating IS NOT NULL AND overall_rating <= 2)::int AS low_rating,
        COUNT(*) FILTER (WHERE recommend_score IS NOT NULL)::int AS recommend_samples
      FROM survey_responses
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND created_at <= NOW()
      GROUP BY survey_key
      ORDER BY responses DESC
      LIMIT 50;
    `,
  },
  {
    name: "user_detail_actor_events",
    thresholdMs: 250,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      WITH target AS (
        SELECT actor_id
        FROM analytics_events
        WHERE actor_id IS NOT NULL
        ORDER BY event_time DESC
        LIMIT 1
      )
      SELECT event_name, event_time, platform
      FROM analytics_events
      WHERE actor_id = (SELECT actor_id FROM target)
      ORDER BY event_time DESC
      LIMIT 30;
    `,
  },
  {
    name: "user_detail_guest_events",
    thresholdMs: 250,
    sql: `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      WITH target AS (
        SELECT guest_id
        FROM analytics_events
        WHERE guest_id IS NOT NULL
        ORDER BY event_time DESC
        LIMIT 1
      )
      SELECT event_name, event_time, platform
      FROM analytics_events
      WHERE guest_id = (SELECT guest_id FROM target)
      ORDER BY event_time DESC
      LIMIT 30;
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

