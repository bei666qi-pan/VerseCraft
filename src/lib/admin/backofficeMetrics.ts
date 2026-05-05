import "server-only";

import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import type { AdminTimeRange } from "@/lib/admin/timeRange";
import { getAdminMetricDefinition } from "@/lib/admin/metricDefinitions";
import { computeAdjacentFunnelStages, decodeCursor, encodeCursor, safeRate } from "@/lib/admin/metricsUtils";
import { getFeedbackInsights, getOverviewMetrics, getRealtimeMetrics } from "@/lib/admin/service";
import { getAdminLoginRateLimitHealth } from "@/lib/admin/loginRateLimit";
import { anyAiProviderConfigured } from "@/lib/ai/config/env";
import { envRaw } from "@/lib/config/envRaw";

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function withDeadline<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export type AdminKpi = {
  metricId: string;
  label: string;
  value: number | string | null;
  unit?: string;
  source: string;
  definition: string;
  updatedAt: string | null;
  degraded: boolean;
  reason: string | null;
};

function kpi(input: {
  metricId: string;
  label?: string;
  value: number | string | null;
  unit?: string;
  source?: string;
  definition?: string;
  updatedAt?: string | null;
  degraded?: boolean;
  reason?: string | null;
}): AdminKpi {
  const def = getAdminMetricDefinition(input.metricId);
  return {
    metricId: input.metricId,
    label: input.label ?? def?.nameZh ?? input.metricId,
    value: input.value,
    unit: input.unit,
    source: input.source ?? def?.source ?? "unknown",
    definition: input.definition ?? def?.calculation ?? "未登记口径",
    updatedAt: input.updatedAt ?? null,
    degraded: Boolean(input.degraded),
    reason: input.reason ?? null,
  };
}

export async function getBackofficeOverview(range: AdminTimeRange) {
  const [overview, realtime, todayExtras] = await Promise.all([
    getOverviewMetrics(range),
    getRealtimeMetrics().catch(() => null),
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM guest_registry WHERE first_seen_at >= CURRENT_DATE AND first_seen_at < CURRENT_DATE + INTERVAL '1 day') AS "newGuestsToday",
        (SELECT COUNT(DISTINCT actor_id)::int FROM actor_daily_activity WHERE date_key = CURRENT_DATE) AS "activeActorsToday",
        (SELECT MAX(updated_at) FROM admin_metrics_daily) AS "adminMetricsUpdatedAt",
        COUNT(*) FILTER (WHERE event_name = 'chat_request_finished')::int AS "aiTotal",
        COUNT(*) FILTER (WHERE event_name = 'chat_request_finished' AND payload->>'success' = 'true')::int AS "aiSuccess",
        COUNT(*) FILTER (WHERE event_name = 'chat_request_finished' AND payload->>'success' = 'false')::int AS "aiFailed",
        COALESCE(SUM(token_cost) FILTER (WHERE event_name = 'chat_request_finished'), 0)::int AS "aiTokenCost"
      FROM analytics_events
      WHERE event_time >= CURRENT_DATE
        AND event_time < CURRENT_DATE + INTERVAL '1 day'
    `).catch(() => ({ rows: [] })),
  ]);
  const extras = rowsOf(todayExtras)[0] ?? {};
  const aiTotal = n(extras.aiTotal);
  const aiSuccess = n(extras.aiSuccess);
  const aiFailed = n(extras.aiFailed);
  const updatedAt = iso(extras.adminMetricsUpdatedAt) ?? new Date().toISOString();
  return {
    ...overview,
    updatedAt,
    kpis: [
      kpi({ metricId: "overview.new_registered_today", value: overview.cards.todayNewUsers, updatedAt }),
      kpi({ metricId: "overview.new_guests_today", value: n(extras.newGuestsToday), updatedAt: new Date().toISOString() }),
      kpi({ metricId: "overview.active_actors_today", value: n(extras.activeActorsToday), updatedAt }),
      kpi({
        metricId: "overview.ai_success_rate_today",
        value: aiTotal > 0 ? safeRate(aiSuccess, aiTotal) : 0,
        unit: "ratio",
        updatedAt: new Date().toISOString(),
      }),
      kpi({
        metricId: "overview.ai_failure_rate_today",
        value: aiTotal > 0 ? safeRate(aiFailed, aiTotal) : 0,
        unit: "failure_ratio",
        updatedAt: new Date().toISOString(),
      }),
      kpi({
        metricId: "overview.online_registered_current",
        label: "当前在线注册用户",
        value: n(realtime?.onlineUsers),
        source: "presence",
        definition: "presence 近窗口在线注册用户。",
        updatedAt: new Date().toISOString(),
        degraded: !realtime,
        reason: realtime ? null : "presence_unavailable",
      } as AdminKpi),
      kpi({
        metricId: "overview.online_guests_current",
        label: "当前在线游客",
        value: n(realtime?.onlineGuests),
        source: "presence",
        definition: "presence 近窗口在线游客会话。",
        updatedAt: new Date().toISOString(),
        degraded: !realtime,
        reason: realtime ? null : "presence_unavailable",
      } as AdminKpi),
      kpi({
        metricId: "overview.token_cost_today",
        label: "今日 Token 成本",
        value: n(extras.aiTokenCost),
        source: "analytics_events.token_cost",
        definition: "今日 chat_request_finished token_cost 求和。",
        updatedAt: new Date().toISOString(),
        degraded: false,
        reason: null,
      } as AdminKpi),
    ],
  };
}

export const JOURNEY_STAGES = [
  "home_viewed",
  "world_selected",
  "character_create_started",
  "character_create_success",
  "enter_main_game",
  "first_effective_action",
  "third_effective_action",
  "save_created",
  "settlement_submitted",
  "feedback_submitted",
] as const;

const JOURNEY_LABELS: Record<string, string> = {
  home_viewed: "首页曝光",
  world_selected: "世界观选择",
  character_create_started: "开始角色创建",
  character_create_success: "角色创建成功",
  enter_main_game: "进入主游戏",
  first_effective_action: "第一轮有效行动",
  third_effective_action: "第三轮有效行动",
  save_created: "创建/同步存档",
  settlement_submitted: "进入结算",
  feedback_submitted: "提交反馈",
};

export async function getPlayerJourneyMetrics(
  range: AdminTimeRange,
  filters: { actorType: "all" | "registered" | "guest"; platform: "all" | "pc" | "mobile" }
) {
  const actorFilter =
    filters.actorType === "registered"
      ? sql`AND COALESCE(actor_type, CASE WHEN user_id IS NOT NULL THEN 'user' ELSE 'guest' END) = 'user'`
      : filters.actorType === "guest"
        ? sql`AND COALESCE(actor_type, CASE WHEN user_id IS NOT NULL THEN 'user' ELSE 'guest' END) = 'guest'`
        : sql``;
  const platformFilter =
    filters.platform === "mobile"
      ? sql`AND platform = 'mobile'`
      : filters.platform === "pc"
        ? sql`AND platform = 'desktop'`
        : sql``;
  const raw = await db.execute(sql`
    WITH normalized AS (
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
        ) AS actor_key
      FROM analytics_events
      WHERE event_time >= ${range.start}
        AND event_time <= ${range.end}
        AND event_name IN (
          'home_viewed','world_selected','character_create_started','character_create_success','create_character_success',
          'enter_main_game','first_effective_action','third_effective_action','save_created','save_sync','save_load',
          'settlement_submitted','game_settlement','feedback_submitted'
        )
        ${actorFilter}
        ${platformFilter}
    )
    SELECT stage, COUNT(DISTINCT actor_key)::int AS count
    FROM normalized
    GROUP BY stage
  `);
  const counts: Record<string, number> = {};
  for (const row of rowsOf(raw)) counts[String(row.stage ?? "")] = n(row.count);
  const stages = computeAdjacentFunnelStages([...JOURNEY_STAGES], counts).map((s) => ({
    ...s,
    label: JOURNEY_LABELS[s.eventName] ?? s.eventName,
    metricId: `journey.${s.eventName}`,
  }));
  const sampleSize = stages[0]?.count ?? 0;
  return {
    range,
    filters,
    sampleSize,
    evidenceSufficiency: sampleSize >= 20 ? "enough" : "insufficient",
    stages,
    updatedAt: new Date().toISOString(),
  };
}

export async function getAiExperienceMetrics(range: AdminTimeRange) {
  const raw = await db.execute(sql`
    WITH chat AS (
      SELECT
        actor_id,
        session_id,
        token_cost,
        CASE WHEN (payload->>'success') = 'true' THEN 1 ELSE 0 END AS success,
        CASE WHEN (payload->>'success') = 'false' THEN 1 ELSE 0 END AS failed,
        CASE
          WHEN (payload->>'aiFallbackCount') ~ '^[0-9]+$' AND (payload->>'aiFallbackCount')::int > 0 THEN 1
          ELSE 0
        END AS fallback_used,
        CASE WHEN (payload->>'finalJsonParseSuccess') = 'false' THEN 1 ELSE 0 END AS parse_failed,
        CASE WHEN (payload->>'firstChunkLatencyMs') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (payload->>'firstChunkLatencyMs')::numeric END AS ttft_ms,
        CASE WHEN (payload->>'totalLatencyMs') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (payload->>'totalLatencyMs')::numeric END AS total_ms,
        CASE WHEN (payload->>'totalTokens') ~ '^[0-9]+$' THEN (payload->>'totalTokens')::int ELSE token_cost END AS tokens
      FROM analytics_events
      WHERE event_name = 'chat_request_finished'
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
    )
    SELECT
      COUNT(*)::int AS "sampleSize",
      COALESCE(SUM(success), 0)::int AS "successCount",
      COALESCE(SUM(failed), 0)::int AS "failedCount",
      COALESCE(SUM(fallback_used), 0)::int AS "fallbackCount",
      COALESCE(SUM(parse_failed), 0)::int AS "parseFailedCount",
      COALESCE(SUM(tokens), 0)::int AS "totalTokens",
      COUNT(DISTINCT COALESCE(actor_id, session_id))::int AS "activeActors",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ttft_ms) AS "ttftP50",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY ttft_ms) AS "ttftP95",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) AS "totalP50",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) AS "totalP95"
    FROM chat
  `);
  const row = rowsOf(raw)[0] ?? {};
  const sampleSize = n(row.sampleSize);
  const totalTokens = n(row.totalTokens);
  const activeActors = n(row.activeActors);
  const topCostRaw = await db.execute(sql`
    SELECT
      COALESCE(actor_id, session_id) AS "actorKey",
      COUNT(*)::int AS "actions",
      COALESCE(SUM(token_cost), 0)::int AS "tokens"
    FROM analytics_events
    WHERE event_name = 'chat_request_finished'
      AND event_time >= ${range.start}
      AND event_time <= ${range.end}
    GROUP BY COALESCE(actor_id, session_id)
    ORDER BY "tokens" DESC
    LIMIT 10
  `).catch(() => ({ rows: [] }));
  return {
    range,
    sampleSize,
    evidenceSufficiency: sampleSize >= 20 ? "enough" : "insufficient",
    metrics: [
      kpi({ metricId: "ai.ttft_p50", label: "TTFT P50", value: row.ttftP50 == null ? null : Math.round(n(row.ttftP50)), unit: "ms", updatedAt: new Date().toISOString() } as AdminKpi),
      kpi({ metricId: "ai.ttft_p95", value: row.ttftP95 == null ? null : Math.round(n(row.ttftP95)), unit: "ms", updatedAt: new Date().toISOString() }),
      kpi({ metricId: "ai.total_latency_p50", label: "总耗时 P50", value: row.totalP50 == null ? null : Math.round(n(row.totalP50)), unit: "ms", updatedAt: new Date().toISOString() } as AdminKpi),
      kpi({ metricId: "ai.total_latency_p95", value: row.totalP95 == null ? null : Math.round(n(row.totalP95)), unit: "ms", updatedAt: new Date().toISOString() }),
    ],
    rates: {
      successRate: safeRate(n(row.successCount), sampleSize),
      failureRate: safeRate(n(row.failedCount), sampleSize),
      fallbackRate: safeRate(n(row.fallbackCount), sampleSize),
      parseFailureRate: safeRate(n(row.parseFailedCount), sampleSize),
      queueWait: { p50: null, p95: null, status: "unavailable" as const },
    },
    cost: {
      totalTokens,
      tokenPerEffectiveAction: safeRate(totalTokens, sampleSize),
      tokenPerActiveActor: safeRate(totalTokens, activeActors),
      highCostActors: rowsOf(topCostRaw).map((r) => ({
        actorKey: String(r.actorKey ?? ""),
        actions: n(r.actions),
        tokens: n(r.tokens),
      })),
    },
    anomalies: sampleSize < 20 ? ["样本不足，趋势仅供补采方向参考。"] : [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getContentQualityMetrics(range: AdminTimeRange) {
  const [feedback, worldRaw, validatorRaw, surveyRaw] = await Promise.all([
    getFeedbackInsights(range).catch(() => null),
    db.execute(sql`
      SELECT COALESCE(payload->>'worldId', payload->>'world') AS "worldId", COUNT(DISTINCT COALESCE(actor_id, session_id))::int AS count
      FROM analytics_events
      WHERE event_name = 'world_selected'
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      GROUP BY COALESCE(payload->>'worldId', payload->>'world')
      ORDER BY count DESC
      LIMIT 10
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT
        COALESCE(payload->>'totalIssues', '1') AS "issueCount",
        payload->'byCode' AS "byCode"
      FROM analytics_events
      WHERE event_name = 'narrative_validator_issue'
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      LIMIT 1000
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT COUNT(*)::int AS "sampleSize"
      FROM survey_responses
      WHERE created_at >= ${range.start}
        AND created_at <= ${range.end}
    `).catch(() => ({ rows: [] })),
  ]);
  const validatorIssues = rowsOf(validatorRaw).reduce((sum, r) => sum + n(r.issueCount), 0);
  const sampleSize = Math.max(n(feedback?.totalFeedback), n(rowsOf(surveyRaw)[0]?.sampleSize), validatorIssues);
  return {
    range,
    evidenceSufficiency: sampleSize >= 20 ? "enough" : "insufficient",
    worldSelections: rowsOf(worldRaw).map((r) => ({ worldId: String(r.worldId ?? "unknown"), count: n(r.count) })),
    chapters: { entered: [], completed: [], evidenceSufficiency: "insufficient" as const },
    npcInteractions: [],
    validatorIssues,
    retryRegenerationCount: 0,
    feedbackTopics: feedback?.topics ?? [],
    feedbackSampleSize: feedback?.totalFeedback ?? 0,
    negativeFeedbackRate: feedback && feedback.totalFeedback > 0 ? safeRate(feedback.negativeFeedback, feedback.totalFeedback) : 0,
    surveySampleSize: n(rowsOf(surveyRaw)[0]?.sampleSize),
    updatedAt: new Date().toISOString(),
  };
}

export async function getSystemHealth() {
  const checks: Record<string, { ok: boolean; degraded: boolean; reason: string | null; updatedAt: string; meta?: Record<string, unknown> }> = {};
  try {
    await withDeadline(pool.query("SELECT 1"), 1200, "db_health_timeout");
    checks.db = { ok: true, degraded: false, reason: null, updatedAt: new Date().toISOString() };
  } catch (error) {
    checks.db = { ok: false, degraded: true, reason: error instanceof Error && error.message === "db_health_timeout" ? "db_health_timeout" : "db_unavailable", updatedAt: new Date().toISOString() };
  }
  const redisHealth = await withDeadline(getAdminLoginRateLimitHealth(), 800, "redis_health_timeout").catch(() => ({
    redisConfigured: false,
    redisAvailable: false,
    fallbackBuckets: 0,
  }));
  checks.redis = {
    ok: redisHealth.redisAvailable,
    degraded: !redisHealth.redisAvailable,
    reason: redisHealth.redisAvailable ? null : redisHealth.redisConfigured ? "redis_ping_failed" : "redis_not_configured",
    updatedAt: new Date().toISOString(),
    meta: { redisConfigured: redisHealth.redisConfigured, fallbackBuckets: redisHealth.fallbackBuckets },
  };
  checks.aiGateway = {
    ok: anyAiProviderConfigured(),
    degraded: !anyAiProviderConfigured(),
    reason: anyAiProviderConfigured() ? null : "ai_gateway_keys_missing",
    updatedAt: new Date().toISOString(),
  };
  const metaRaw = await withDeadline(db.execute(sql`
    SELECT
      (SELECT MAX(created_at) FROM admin_audit_logs WHERE action = 'admin_cron_rebuild_daily') AS "lastCronAt",
      (SELECT MAX(updated_at) FROM admin_metrics_daily) AS "aggregationFreshness",
      (SELECT COUNT(*)::int FROM analytics_events WHERE event_time >= NOW() - INTERVAL '1 hour' AND event_name LIKE '%failed%') AS "recentErrors"
  `), 1200, "system_health_meta_timeout").catch(() => ({ rows: [] }));
  const meta = rowsOf(metaRaw)[0] ?? {};
  return {
    checks,
    cron: { lastRebuildAt: iso(meta.lastCronAt), updatedAt: new Date().toISOString() },
    aggregationFreshness: iso(meta.aggregationFreshness),
    slowQueries: { count: 0, source: "scripts/admin-explain-baseline.ts" },
    recentErrors: n(meta.recentErrors),
    deployment: {
      commitSha: envRaw("VERCEL_GIT_COMMIT_SHA") ?? envRaw("GITHUB_SHA") ?? null,
      nodeEnv: envRaw("NODE_ENV") ?? "development",
    },
    updatedAt: new Date().toISOString(),
  };
}

function parseOffsetCursor(cursor: string | null | undefined): number {
  const decoded = decodeCursor(cursor);
  const first = decoded?.[0];
  const offset = Number(first ?? 0);
  return Number.isFinite(offset) && offset >= 0 ? Math.trunc(offset) : 0;
}

export async function listAdminUsers(opts: {
  limit?: number;
  cursor?: string | null;
  search?: string | null;
  onlyOnline?: boolean;
  actorType?: "all" | "registered" | "guest";
  sort?: "tokens" | "lastActive" | "playTime";
}) {
  const limit = Math.max(1, Math.min(100, Math.trunc(opts.limit ?? 20)));
  const offset = parseOffsetCursor(opts.cursor);
  const search = `%${(opts.search ?? "").trim().replace(/[%_]/g, "")}%`;
  const actorType = opts.actorType ?? "all";
  const onlyOnline = Boolean(opts.onlyOnline);
  const orderBy =
    opts.sort === "tokens"
      ? sql`tokens_used DESC, last_active DESC`
      : opts.sort === "playTime"
        ? sql`play_time DESC, last_active DESC`
        : sql`last_active DESC, tokens_used DESC`;
  const actorFilter =
    actorType === "registered"
      ? sql`WHERE actor_type = 'registered'`
      : actorType === "guest"
        ? sql`WHERE actor_type = 'guest'`
        : sql`WHERE true`;
  const onlineFilter = onlyOnline ? sql`AND is_online = true` : sql``;
  const searchFilter = opts.search?.trim()
    ? sql`AND (actor_key ILIKE ${search} OR display_name ILIKE ${search})`
    : sql``;
  const raw = await db.execute(sql`
    WITH registered AS (
      SELECT
        ('u:' || id) AS actor_key,
        id AS raw_id,
        name AS display_name,
        'registered' AS actor_type,
        tokens_used,
        play_time,
        last_active,
        (last_active >= NOW() - INTERVAL '90 seconds') AS is_online
      FROM users
    ),
    guests AS (
      SELECT
        ('g:' || g.guest_id) AS actor_key,
        g.guest_id AS raw_id,
        COALESCE('guest:' || g.guest_id, 'guest') AS display_name,
        'guest' AS actor_type,
        COALESCE(t.tokens_used, 0)::int AS tokens_used,
        COALESCE(g.total_play_duration_sec, 0)::int AS play_time,
        g.last_seen_at AS last_active,
        (g.last_seen_at >= NOW() - INTERVAL '90 seconds') AS is_online
      FROM guest_registry g
      LEFT JOIN (
        SELECT guest_id, COALESCE(SUM(daily_token_cost), 0)::int AS tokens_used
        FROM guest_daily_tokens
        GROUP BY guest_id
      ) t ON t.guest_id = g.guest_id
    ),
    combined AS (
      SELECT * FROM registered
      UNION ALL
      SELECT * FROM guests
    ),
    filtered AS (
      SELECT * FROM combined
      ${actorFilter}
      ${onlineFilter}
      ${searchFilter}
    )
    SELECT *, COUNT(*) OVER()::int AS total
    FROM filtered
    ORDER BY ${orderBy}
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `);
  const rows = rowsOf(raw);
  const page = rows.slice(0, limit);
  const totalApprox = n(rows[0]?.total);
  return {
    rows: page.map((r) => ({
      actorKey: String(r.actor_key ?? ""),
      rawId: String(r.raw_id ?? ""),
      name: String(r.display_name ?? ""),
      actorType: String(r.actor_type ?? "unknown"),
      tokensUsed: n(r.tokens_used),
      playTime: n(r.play_time),
      lastActive: iso(r.last_active),
      isOnline: Boolean(r.is_online),
    })),
    nextCursor: rows.length > limit ? encodeCursor([offset + limit]) : null,
    hasMore: rows.length > limit,
    totalApprox,
    limit,
  };
}

export async function getAdminUserDetail(actorKey: string) {
  const isUser = actorKey.startsWith("u:");
  const isGuest = actorKey.startsWith("g:");
  const rawId = actorKey.slice(2);
  if (!rawId || (!isUser && !isGuest)) return null;

  const baseRaw = isUser
    ? await db.execute(sql`
        SELECT id AS "rawId", name, tokens_used AS "tokensUsed", play_time AS "playTime", last_active AS "lastActive", 'registered' AS "actorType"
        FROM users WHERE id = ${rawId} LIMIT 1
      `)
    : await db.execute(sql`
        SELECT guest_id AS "rawId", ('guest:' || guest_id) AS name, 0 AS "tokensUsed", total_play_duration_sec AS "playTime", last_seen_at AS "lastActive", 'guest' AS "actorType"
        FROM guest_registry WHERE guest_id = ${rawId} LIMIT 1
      `);
  const base = rowsOf(baseRaw)[0];
  if (!base) return null;
  const [feedbackRaw, surveyRaw, settlementRaw, eventsRaw] = await Promise.all([
    db.execute(sql`
      SELECT content, kind, created_at AS "createdAt"
      FROM feedbacks
      WHERE ${isUser ? sql`user_id = ${rawId}` : sql`guest_id = ${rawId}`}
      ORDER BY created_at DESC
      LIMIT 5
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT survey_key AS "surveyKey", survey_version AS "surveyVersion", overall_rating AS "overallRating", recommend_score AS "recommendScore", created_at AS "createdAt"
      FROM survey_responses
      WHERE ${isUser ? sql`user_id = ${rawId}` : sql`guest_id = ${rawId}`}
      ORDER BY created_at DESC
      LIMIT 5
    `).catch(() => ({ rows: [] })),
    isUser
      ? db.execute(sql`
          SELECT grade, survival_time_seconds AS "survivalTimeSeconds", killed_anomalies AS "killedAnomalies", max_floor_label AS "maxFloorLabel", created_at AS "createdAt"
          FROM settlement_histories
          WHERE user_id = ${rawId}
          ORDER BY created_at DESC
          LIMIT 5
        `).catch(() => ({ rows: [] }))
      : Promise.resolve({ rows: [] }),
    db.execute(sql`
      SELECT event_name AS "eventName", event_time AS "eventTime", page, source, payload
      FROM analytics_events
      WHERE ${isUser ? sql`user_id = ${rawId}` : sql`guest_id = ${rawId}`}
      ORDER BY event_time DESC
      LIMIT 20
    `).catch(() => ({ rows: [] })),
  ]);
  return {
    actorKey,
    basic: {
      rawId: String(base.rawId ?? ""),
      name: String(base.name ?? ""),
      actorType: String(base.actorType ?? ""),
      tokensUsed: n(base.tokensUsed),
      playTime: n(base.playTime),
      lastActive: iso(base.lastActive),
    },
    recentFeedback: rowsOf(feedbackRaw).map((r) => ({
      kind: String(r.kind ?? "open"),
      contentPreview: String(r.content ?? "").slice(0, 120),
      createdAt: iso(r.createdAt),
    })),
    recentSurvey: rowsOf(surveyRaw).map((r) => ({
      surveyKey: String(r.surveyKey ?? ""),
      surveyVersion: String(r.surveyVersion ?? ""),
      overallRating: r.overallRating == null ? null : n(r.overallRating),
      recommendScore: r.recommendScore == null ? null : n(r.recommendScore),
      createdAt: iso(r.createdAt),
    })),
    recentSettlements: rowsOf(settlementRaw).map((r) => ({
      grade: String(r.grade ?? ""),
      survivalTimeSeconds: n(r.survivalTimeSeconds),
      killedAnomalies: n(r.killedAnomalies),
      maxFloorLabel: String(r.maxFloorLabel ?? ""),
      createdAt: iso(r.createdAt),
    })),
    recentEvents: rowsOf(eventsRaw).map((r) => ({
      eventName: String(r.eventName ?? ""),
      eventTime: iso(r.eventTime),
      page: r.page ? String(r.page) : null,
      source: r.source ? String(r.source) : null,
      payloadSummary:
        r.payload && typeof r.payload === "object"
          ? Object.fromEntries(Object.entries(r.payload as Record<string, unknown>).slice(0, 8))
          : {},
    })),
  };
}
