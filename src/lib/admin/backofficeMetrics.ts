import "server-only";

import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import type { AdminTimeRange } from "@/lib/admin/timeRange";
import { getAdminMetricDefinition } from "@/lib/admin/metricDefinitions";
import { decodeCursor, encodeCursor, safeRate } from "@/lib/admin/metricsUtils";
import {
  computeJourneyFunnelStages,
  normalizeJourneyFunnelEvents,
  type JourneyFunnelMode,
} from "@/lib/admin/journeyFunnel";
import { buildContentQualityMetricsSnapshot } from "@/lib/admin/contentQualityMetrics";
import { buildAdminUserDetailSignals } from "@/lib/admin/userDetailSignals";
import { getFeedbackInsights, getOverviewMetrics, getRealtimeMetrics } from "@/lib/admin/service";
import { getAdminLoginRateLimitHealth } from "@/lib/admin/loginRateLimit";
import { computeAdminCapacityEstimate } from "@/lib/admin/capacityEstimate";
import { normalizePresenceMemberToActorKey } from "@/lib/admin/adminActorKeys";
import { anyAiProviderConfigured } from "@/lib/ai/config/env";
import { envRaw } from "@/lib/config/envRaw";
import { getChatQueueConfig } from "@/lib/chatQueue/config";
import { shouldQueueChatRequest } from "@/lib/chatQueue/service";
import { getOnlinePresenceReport } from "@/lib/presence";
import { ONLINE_WINDOW_SECONDS } from "@/lib/presence/onlineWindow";
import { sanitizeHomeSurveyText, summarizeHomeSurveyAnswers } from "@/lib/survey/productSurveyHomeV1";

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

async function getOnlineAdminActorKeys(): Promise<Set<string>> {
  try {
    const report = await getOnlinePresenceReport();
    return new Set(report.ids.map(normalizePresenceMemberToActorKey).filter(Boolean));
  } catch {
    return new Set();
  }
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
        label: "今日 AI 用量",
        value: n(extras.aiTokenCost),
        source: "analytics_events.chat_request_finished.token_cost / actor_daily_tokens",
        definition: "今日 AI 回合完成事件记录的 token_cost 求和，日表按同一 actor key 回写。",
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
  filters: { actorType: "all" | "registered" | "guest"; platform: "all" | "pc" | "mobile" },
  mode: JourneyFunnelMode = "strict"
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
        COALESCE(actor_type, CASE WHEN user_id IS NOT NULL THEN 'user' ELSE 'guest' END) AS actor_type,
        platform,
        event_time
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
    ),
    normalized AS (
      SELECT stage, actor_key, MIN(event_time) AS first_at
      FROM raw_events
      GROUP BY stage, actor_key
    )
    SELECT
      r.stage,
      r.actor_key AS "actorKey",
      MIN(r.actor_type) AS "actorType",
      MIN(r.platform) AS platform,
      n.first_at AS "firstAt"
    FROM normalized n
    JOIN raw_events r ON r.stage = n.stage AND r.actor_key = n.actor_key
    GROUP BY r.stage, r.actor_key, n.first_at
  `);
  const normalizedEvents = normalizeJourneyFunnelEvents(
    rowsOf(raw).map((row) => ({
      stage: String(row.stage ?? ""),
      actorKey: String(row.actorKey ?? ""),
      actorType: String(row.actorType ?? ""),
      platform: String(row.platform ?? ""),
      firstAt: row.firstAt as Date | string | number | null,
    })),
    filters
  );
  const stages = computeJourneyFunnelStages(JOURNEY_STAGES, normalizedEvents, mode).map((s) => ({
    ...s,
    label: JOURNEY_LABELS[s.eventName] ?? s.eventName,
    metricId: `journey.${s.eventName}`,
  }));
  const sampleSize = stages[0]?.count ?? 0;
  return {
    range,
    filters,
    mode,
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
        COALESCE(
          actor_id,
          CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id END,
          CASE WHEN guest_id IS NOT NULL AND btrim(guest_id::text) <> '' THEN 'g:' || guest_id END,
          CASE WHEN session_id IS NOT NULL AND btrim(session_id::text) <> '' THEN 's:' || session_id END
        ) AS actor_key,
        token_cost,
        CASE WHEN (payload->>'success') = 'true' THEN 1 ELSE 0 END AS success,
        CASE WHEN (payload->>'success') = 'false' THEN 1 ELSE 0 END AS failed,
        CASE
          WHEN (payload->>'aiFallbackCount') ~ '^[0-9]+$' AND (payload->>'aiFallbackCount')::int > 0 THEN 1
          ELSE 0
        END AS fallback_used,
        CASE WHEN (payload->>'finalJsonParseSuccess') = 'false' THEN 1 ELSE 0 END AS parse_failed,
        CASE
          WHEN (payload->>'rateLimited') = 'true'
            OR (payload->>'httpStatus') = '429'
            OR (payload->>'upstreamStatus') = '429'
            OR (payload->>'routerCode') ~* 'rate|429'
            OR (payload->>'errorType') ~* 'rate|429'
          THEN 1
          ELSE 0
        END AS rate_limited,
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
      COALESCE(SUM(rate_limited), 0)::int AS "rateLimitCount",
      COALESCE(SUM(tokens), 0)::int AS "totalTokens",
      COUNT(DISTINCT actor_key)::int AS "activeActors",
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
      COALESCE(
        actor_id,
        CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id END,
        CASE WHEN guest_id IS NOT NULL AND btrim(guest_id::text) <> '' THEN 'g:' || guest_id END,
        CASE WHEN session_id IS NOT NULL AND btrim(session_id::text) <> '' THEN 's:' || session_id END
      ) AS "actorKey",
      COUNT(*)::int AS "actions",
      COALESCE(SUM(token_cost), 0)::int AS "tokens"
    FROM analytics_events
    WHERE event_name = 'chat_request_finished'
      AND event_time >= ${range.start}
      AND event_time <= ${range.end}
    GROUP BY 1
    ORDER BY "tokens" DESC
    LIMIT 10
  `).catch(() => ({ rows: [] }));
  return {
    range,
    sampleSize,
    evidenceSufficiency: sampleSize >= 20 ? "enough" : "insufficient",
    metrics: [
      kpi({ metricId: "ai.ttft_p50", label: "首段等待中位数", value: row.ttftP50 == null ? null : Math.round(n(row.ttftP50)), unit: "ms", updatedAt: new Date().toISOString() } as AdminKpi),
      kpi({ metricId: "ai.ttft_p95", value: row.ttftP95 == null ? null : Math.round(n(row.ttftP95)), unit: "ms", updatedAt: new Date().toISOString() }),
      kpi({ metricId: "ai.total_latency_p50", label: "总耗时中位数", value: row.totalP50 == null ? null : Math.round(n(row.totalP50)), unit: "ms", updatedAt: new Date().toISOString() } as AdminKpi),
      kpi({ metricId: "ai.total_latency_p95", value: row.totalP95 == null ? null : Math.round(n(row.totalP95)), unit: "ms", updatedAt: new Date().toISOString() }),
    ],
    rates: {
      successRate: safeRate(n(row.successCount), sampleSize),
      failureRate: safeRate(n(row.failedCount), sampleSize),
      fallbackRate: safeRate(n(row.fallbackCount), sampleSize),
      parseFailureRate: safeRate(n(row.parseFailedCount), sampleSize),
      rateLimitRate: safeRate(n(row.rateLimitCount), sampleSize),
      queueWait: { p50: null, p95: null, status: "unavailable" as const },
    },
    rateLimitCount: n(row.rateLimitCount),
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
  const actorKeySql = sql`COALESCE(
    actor_id,
    CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id END,
    CASE WHEN guest_id IS NOT NULL AND btrim(guest_id::text) <> '' THEN 'g:' || guest_id END,
    's:' || session_id
  )`;
  const worldIdSql = sql`COALESCE(NULLIF(payload->>'worldId', ''), NULLIF(payload->>'world', ''), NULLIF(payload->>'world_id', ''), 'unknown')`;
  const chapterIdSql = sql`COALESCE(NULLIF(payload->>'chapterId', ''), NULLIF(payload->>'chapter_id', ''), NULLIF(payload->>'currentChapterId', ''), NULLIF(payload->>'activeChapterId', ''), NULLIF(payload->>'chapter', ''), 'unknown')`;
  const npcIdSql = sql`COALESCE(NULLIF(payload->>'npcId', ''), NULLIF(payload->>'npc_id', ''), NULLIF(payload->>'targetNpcId', ''), 'unknown')`;

  const [
    feedback,
    worldRaw,
    worldFirstActionRaw,
    chapterRaw,
    npcRaw,
    validatorRaw,
    retryRaw,
    surveyRaw,
  ] = await Promise.all([
    getFeedbackInsights(range).catch(() => null),
    db.execute(sql`
      SELECT ${worldIdSql} AS "worldId", COUNT(DISTINCT ${actorKeySql})::int AS count
      FROM analytics_events
      WHERE event_name = 'world_selected'
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      GROUP BY ${worldIdSql}
      ORDER BY count DESC
      LIMIT 10
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT ${worldIdSql} AS "worldId", COUNT(DISTINCT ${actorKeySql})::int AS count
      FROM analytics_events
      WHERE event_name = 'first_effective_action'
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      GROUP BY ${worldIdSql}
      ORDER BY count DESC
      LIMIT 20
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT event_name AS "eventName", ${worldIdSql} AS "worldId", ${chapterIdSql} AS "chapterId", COUNT(DISTINCT ${actorKeySql})::int AS count
      FROM analytics_events
      WHERE event_name IN ('chapter_entered', 'chapter_completed', 'chapter_abandoned')
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      GROUP BY event_name, ${worldIdSql}, ${chapterIdSql}
      ORDER BY count DESC
      LIMIT 200
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT event_name AS "eventName", ${worldIdSql} AS "worldId", ${chapterIdSql} AS "chapterId", ${npcIdSql} AS "npcId", COUNT(*)::int AS count
      FROM analytics_events
      WHERE event_name IN ('npc_interaction_started', 'npc_interaction_completed', 'npc_interaction_failed')
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      GROUP BY event_name, ${worldIdSql}, ${chapterIdSql}, ${npcIdSql}
      ORDER BY count DESC
      LIMIT 200
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT
        event_name AS "eventName",
        COALESCE(payload->>'totalIssues', payload->>'issueCount', '1') AS "issueCount",
        payload->'byCode' AS "byCode",
        payload->'issueCodes' AS "issueCodes",
        COALESCE(payload->>'issueCode', payload->>'code') AS "issueCode"
      FROM analytics_events
      WHERE event_name IN (
        'narrative_validator_issue',
        'narrative_safety_issue',
        'entity_audit_issue',
        'pacing_validator_issue',
        'unknown_entity_blocked',
        'prompt_injection_blocked',
        'narrative_protocol_leak'
      )
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      LIMIT 2000
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT event_name AS "eventName", COUNT(*)::int AS count
      FROM analytics_events
      WHERE event_name IN ('retry_clicked', 'regen_clicked')
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      GROUP BY event_name
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT COUNT(*)::int AS "sampleSize"
      FROM survey_responses
      WHERE created_at >= ${range.start}
        AND created_at <= ${range.end}
    `).catch(() => ({ rows: [] })),
  ]);
  const snapshot = buildContentQualityMetricsSnapshot({
    worldSelectionRows: rowsOf(worldRaw),
    worldFirstActionRows: rowsOf(worldFirstActionRaw),
    chapterRows: rowsOf(chapterRaw),
    npcRows: rowsOf(npcRaw),
    validatorRows: rowsOf(validatorRaw),
    retryRows: rowsOf(retryRaw),
    feedbackTopics: feedback?.topics ?? [],
    feedbackSampleSize: feedback?.totalFeedback ?? 0,
    negativeFeedbackCount: feedback?.negativeFeedback ?? 0,
    surveySampleSize: n(rowsOf(surveyRaw)[0]?.sampleSize),
  });
  return {
    range,
    ...snapshot,
    validatorIssueCount: snapshot.validatorIssues.total,
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
  const aiGatewayOk = anyAiProviderConfigured();
  checks.aiGateway = {
    ok: aiGatewayOk,
    degraded: !aiGatewayOk,
    reason: aiGatewayOk ? null : "ai_gateway_keys_missing",
    updatedAt: new Date().toISOString(),
  };
  const metaRaw = await withDeadline(db.execute(sql`
    SELECT
      (SELECT MAX(created_at) FROM admin_audit_logs WHERE action = 'admin_cron_rebuild_daily') AS "lastCronAt",
      (SELECT MAX(updated_at) FROM admin_metrics_daily) AS "aggregationFreshness",
      (SELECT COUNT(*)::int FROM analytics_events WHERE event_time >= NOW() - INTERVAL '1 hour' AND event_name LIKE '%failed%') AS "recentErrors",
      (SELECT COUNT(*)::int FROM analytics_events WHERE event_time >= NOW() - INTERVAL '1 hour' AND event_name = 'chat_request_finished') AS "recentAiRequests"
  `), 1200, "system_health_meta_timeout").catch(() => ({ rows: [] }));
  const meta = rowsOf(metaRaw)[0] ?? {};
  const realtime = await withDeadline(getRealtimeMetrics(), 1200, "system_health_realtime_timeout").catch(() => null);
  const queueConfig = getChatQueueConfig();
  const queueDecision = await withDeadline(shouldQueueChatRequest(), 800, "chat_queue_capacity_timeout").catch(() => null);
  const queueDepthKnown = Boolean(queueDecision?.enabled && queueDecision.runningCount != null && queueDecision.queuedCount != null);
  const runningCount = queueDecision?.runningCount ?? null;
  const queuedCount = queueDecision?.queuedCount ?? null;
  const remainingImmediate = runningCount == null ? null : Math.max(0, queueConfig.maxRunning - runningCount);
  const remainingQueueSlots = queuedCount == null ? null : Math.max(0, queueConfig.maxQueued - queuedCount);
  const capacityEstimate = computeAdminCapacityEstimate({
    queueEnabled: queueConfig.enabled,
    queueDepthKnown,
    runningCount,
    queuedCount,
    maxRunning: queueConfig.maxRunning,
    maxQueued: queueConfig.maxQueued,
    dbOk: checks.db.ok,
    aiGatewayOk,
    recentAiSampleSize: n(meta.recentAiRequests),
  });
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
    capacity: {
      online: {
        registered: n(realtime?.onlineUsers),
        guests: n(realtime?.onlineGuests),
        total: n(realtime?.onlineUsers) + n(realtime?.onlineGuests),
        activeSessions: n(realtime?.activeSessions),
        windowSeconds: ONLINE_WINDOW_SECONDS,
        source: realtime ? "presence_window" : "unavailable",
      },
      chatQueue: {
        enabled: queueConfig.enabled,
        running: runningCount,
        queued: queuedCount,
        maxRunning: queueConfig.maxRunning,
        maxQueued: queueConfig.maxQueued,
        remainingImmediate,
        remainingQueueSlots,
        estimatedSecondsPerTurn: queueConfig.estimatedSecondsPerTurn,
      },
      estimate: capacityEstimate,
      evidence: {
        recentAiRequests: n(meta.recentAiRequests),
        dbOk: checks.db.ok,
        aiGatewayOk,
        queueDepthKnown,
      },
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
  const onlineActorKeys = await getOnlineAdminActorKeys();
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
  const onlineFilter = onlyOnline
    ? onlineActorKeys.size > 0
      ? sql`AND actor_key IN (${sql.join([...onlineActorKeys].map((key) => sql`${key}`), sql`, `)})`
      : sql`AND false`
    : sql``;
  const searchFilter = opts.search?.trim()
    ? sql`AND (actor_key ILIKE ${search} OR display_name ILIKE ${search})`
    : sql``;
  const raw = await db.execute(sql`
    WITH registered_token_rollup AS (
      SELECT
        user_id,
        COALESCE(SUM(daily_token_cost), 0)::int AS tokens_used,
        COALESCE(SUM(active_play_sec), 0)::int AS play_time
      FROM actor_daily_tokens
      WHERE actor_type = 'user'
        AND user_id IS NOT NULL
      GROUP BY user_id
    ),
    registered AS (
      SELECT
        ('u:' || u.id) AS actor_key,
        u.id AS raw_id,
        u.name AS display_name,
        'registered' AS actor_type,
        COALESCE(rt.tokens_used, u.tokens_used, 0)::int AS tokens_used,
        COALESCE(rt.play_time, u.play_time, 0)::int AS play_time,
        u.last_active
      FROM users u
      LEFT JOIN registered_token_rollup rt ON rt.user_id = u.id
    ),
    guests AS (
      SELECT
        ('g:' || a.guest_id) AS actor_key,
        a.guest_id AS raw_id,
        CASE WHEN al.guest_no > 0 THEN ('游客' || al.guest_no::text) ELSE '游客' END AS display_name,
        'guest' AS actor_type,
        COALESCE(t.tokens_used, 0)::int AS tokens_used,
        COALESCE(t.play_time, 0)::int AS play_time,
        a.last_seen_at AS last_active
      FROM analytics_actors a
      LEFT JOIN guest_aliases al ON al.guest_id = a.guest_id
      LEFT JOIN (
        SELECT
          actor_id,
          COALESCE(SUM(daily_token_cost), 0)::int AS tokens_used,
          COALESCE(SUM(active_play_sec), 0)::int AS play_time
        FROM actor_daily_tokens
        GROUP BY actor_id
      ) t ON t.actor_id = a.actor_id
      WHERE a.actor_type = 'guest'
        AND a.guest_id IS NOT NULL
        AND a.guest_id <> ''
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
      isOnline: onlineActorKeys.has(String(r.actor_key ?? "")),
    })),
    nextCursor: rows.length > limit ? encodeCursor([offset + limit]) : null,
    hasMore: rows.length > limit,
    totalApprox,
    limit,
  };
}

function objectOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function previewText(value: unknown, maxChars = 120): string {
  return text(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b1[3-9]\d{9}\b/g, "[phone]")
    .replace(/\b\d{6,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .slice(0, maxChars);
}

function summarizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const sensitive = /password|cookie|session|database_url|api[_-]?key|authorization|secret|token/i;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= 8) break;
    if (sensitive.test(key)) continue;
    if (typeof raw === "string") {
      out[key] = previewText(raw, 80);
    } else if (raw == null || typeof raw === "number" || typeof raw === "boolean") {
      out[key] = raw;
    } else {
      out[key] = Array.isArray(raw) ? `[array:${raw.length}]` : "[object]";
    }
  }
  return out;
}

function isNegativeFeedback(row: Record<string, unknown>): boolean {
  const kind = text(row.kind).toLowerCase();
  const content = text(row.content).toLowerCase();
  return (
    /(negative|bug|complaint|risk|bad|fail)/.test(kind) ||
    /慢|等|卡|失败|不好|看不懂|不知道|崩|丢|存档|难用|失望|不稳定/.test(content)
  );
}

function surveyRiskFlags(row: Record<string, unknown>): { negative: boolean; saveAnxiety: boolean } {
  const answers = objectOf(row.answers);
  const overallRating = row.overallRating == null ? null : n(row.overallRating);
  const recommendScore = row.recommendScore == null ? null : n(row.recommendScore);
  const recommendWillingness = text(answers.recommendWillingness);
  const saveLossConcern = text(answers.saveLossConcern);
  const quitReason = text(answers.quitReason);
  const openText = `${text(answers.topFixOne)} ${text(answers.finalSuggestion)} ${text(row.freeText)}`;
  return {
    negative:
      (overallRating != null && overallRating <= 2) ||
      (recommendScore != null && recommendScore <= 4) ||
      recommendWillingness === "unwilling" ||
      /等待|太久|看不懂|不知道|不稳定|难用|失望|失败/.test(openText),
    saveAnxiety:
      saveLossConcern === "quite_worried_frequent_check" ||
      saveLossConcern === "very_worried_affects_continue" ||
      saveLossConcern === "already_lost_or_cannot_find" ||
      quitReason === "save_progress_insecure" ||
      /存档|进度|保存|丢档|丢失/.test(openText),
  };
}

export async function getAdminUserDetail(actorKey: string) {
  const isUser = actorKey.startsWith("u:");
  const isGuest = actorKey.startsWith("g:");
  const rawId = actorKey.slice(2);
  if (!rawId || (!isUser && !isGuest)) return null;

  const baseRaw = isUser
    ? await db.execute(sql`
        WITH token_rollup AS (
          SELECT
            user_id,
            COALESCE(SUM(daily_token_cost), 0)::int AS tokens_used,
            COALESCE(SUM(active_play_sec), 0)::int AS play_time
          FROM actor_daily_tokens
          WHERE actor_type = 'user'
            AND user_id = ${rawId}
          GROUP BY user_id
        )
        SELECT
          u.id AS "rawId",
          u.name,
          COALESCE(t.tokens_used, u.tokens_used, 0)::int AS "tokensUsed",
          COALESCE(t.play_time, u.play_time, 0)::int AS "playTime",
          u.last_active AS "lastActive",
          'registered' AS "actorType"
        FROM users u
        LEFT JOIN token_rollup t ON t.user_id = u.id
        WHERE u.id = ${rawId}
        LIMIT 1
      `)
    : await db.execute(sql`
        SELECT
          g.guest_id AS "rawId",
          ('游客 ' || RIGHT(REPLACE(g.guest_id, '-', ''), 4)) AS name,
          COALESCE(t.tokens_used, 0)::int AS "tokensUsed",
          g.total_play_duration_sec AS "playTime",
          g.last_seen_at AS "lastActive",
          'guest' AS "actorType"
        FROM guest_registry g
        LEFT JOIN (
          SELECT guest_id, COALESCE(SUM(daily_token_cost), 0)::int AS tokens_used
          FROM guest_daily_tokens
          GROUP BY guest_id
        ) t ON t.guest_id = g.guest_id
        WHERE g.guest_id = ${rawId}
        LIMIT 1
      `);
  let base = rowsOf(baseRaw)[0];
  if (!base && isGuest) {
    const fallbackBaseRaw = await db
      .execute(sql`
        SELECT
          ${rawId} AS "rawId",
          ('游客 ' || RIGHT(REPLACE(${rawId}, '-', ''), 4)) AS name,
          COALESCE(SUM(token_cost), 0)::int AS "tokensUsed",
          0::int AS "playTime",
          MAX(event_time) AS "lastActive",
          'guest' AS "actorType"
        FROM analytics_events
        WHERE guest_id = ${rawId} OR actor_id = ${actorKey}
        LIMIT 1
      `)
      .catch(() => ({ rows: [] }));
    base = rowsOf(fallbackBaseRaw)[0];
  }
  if (!base) return null;
  const actorEventWhere = isUser
    ? sql`(user_id = ${rawId} OR actor_id = ${actorKey})`
    : sql`(guest_id = ${rawId} OR actor_id = ${actorKey})`;
  const worldIdSql = sql`COALESCE(NULLIF(payload->>'worldId', ''), NULLIF(payload->>'world', ''), NULLIF(payload->>'world_id', ''), 'unknown')`;
  const chapterIdSql = sql`COALESCE(NULLIF(payload->>'chapterId', ''), NULLIF(payload->>'chapter_id', ''), NULLIF(payload->>'currentChapterId', ''), NULLIF(payload->>'activeChapterId', ''), NULLIF(payload->>'chapter', ''), 'unknown')`;
  const npcIdSql = sql`COALESCE(NULLIF(payload->>'npcId', ''), NULLIF(payload->>'npc_id', ''), NULLIF(payload->>'targetNpcId', ''), 'unknown')`;
  const [feedbackRaw, surveyRaw, settlementRaw, eventsRaw, aiRaw, worldsRaw, chaptersRaw, npcsRaw] = await Promise.all([
    db.execute(sql`
      SELECT content, kind, created_at AS "createdAt"
      FROM feedbacks
      WHERE ${isUser ? sql`user_id = ${rawId}` : sql`guest_id = ${rawId}`}
      ORDER BY created_at DESC
      LIMIT 5
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT
        survey_key AS "surveyKey",
        survey_version AS "surveyVersion",
        answers,
        free_text AS "freeText",
        overall_rating AS "overallRating",
        recommend_score AS "recommendScore",
        created_at AS "createdAt"
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
      WHERE ${actorEventWhere}
      ORDER BY event_time DESC
      LIMIT 30
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS "requestCount",
        COALESCE(SUM(token_cost), 0)::int AS "tokenCost",
        COALESCE(AVG(CASE WHEN payload->>'totalLatencyMs' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (payload->>'totalLatencyMs')::numeric ELSE NULL END), 0)::int AS "avgLatency",
        COUNT(*) FILTER (WHERE COALESCE(payload->>'success', 'true') = 'false')::int AS "failureCount",
        COUNT(*) FILTER (WHERE COALESCE(payload->>'fallbackUsed', 'false') = 'true')::int AS "fallbackCount",
        COUNT(*) FILTER (WHERE payload->>'totalLatencyMs' ~ '^[0-9]+(\\.[0-9]+)?$' AND (payload->>'totalLatencyMs')::numeric >= 18000)::int AS "slowRequestCount"
      FROM analytics_events
      WHERE ${actorEventWhere}
        AND event_name = 'chat_request_finished'
      LIMIT 1
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT ${worldIdSql} AS "worldId", COUNT(*)::int AS count, MAX(event_time) AS "lastEventAt"
      FROM analytics_events
      WHERE ${actorEventWhere}
        AND event_name IN ('world_selected', 'enter_main_game', 'first_effective_action', 'chapter_entered', 'chapter_completed', 'chapter_abandoned')
      GROUP BY ${worldIdSql}
      ORDER BY count DESC, "lastEventAt" DESC
      LIMIT 10
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT
        ${worldIdSql} AS "worldId",
        ${chapterIdSql} AS "chapterId",
        COUNT(*) FILTER (WHERE event_name = 'chapter_entered')::int AS entered,
        COUNT(*) FILTER (WHERE event_name = 'chapter_completed')::int AS completed,
        COUNT(*) FILTER (WHERE event_name = 'chapter_abandoned')::int AS abandoned,
        MAX(event_time) AS "lastEventAt"
      FROM analytics_events
      WHERE ${actorEventWhere}
        AND event_name IN ('chapter_entered', 'chapter_completed', 'chapter_abandoned')
      GROUP BY ${worldIdSql}, ${chapterIdSql}
      ORDER BY "lastEventAt" DESC
      LIMIT 20
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT
        ${npcIdSql} AS "npcId",
        COUNT(*) FILTER (WHERE event_name = 'npc_interaction_started')::int AS started,
        COUNT(*) FILTER (WHERE event_name = 'npc_interaction_completed')::int AS completed,
        COUNT(*) FILTER (WHERE event_name = 'npc_interaction_failed')::int AS failed,
        MAX(event_time) AS "lastEventAt"
      FROM analytics_events
      WHERE ${actorEventWhere}
        AND event_name IN ('npc_interaction_started', 'npc_interaction_completed', 'npc_interaction_failed')
      GROUP BY ${npcIdSql}
      ORDER BY "lastEventAt" DESC
      LIMIT 20
    `).catch(() => ({ rows: [] })),
  ]);
  const basic = {
    rawId: String(base.rawId ?? ""),
    name: String(base.name ?? ""),
    actorType: String(base.actorType ?? ""),
    tokensUsed: n(base.tokensUsed),
    playTime: n(base.playTime),
    lastActive: iso(base.lastActive),
  };
  const feedbackRows = rowsOf(feedbackRaw);
  const surveyRows = rowsOf(surveyRaw);
  const recentFeedback = feedbackRows.map((r) => ({
    kind: String(r.kind ?? "open"),
    contentPreview: previewText(r.content),
    createdAt: iso(r.createdAt),
    negative: isNegativeFeedback(r),
  }));
  const recentSurvey = surveyRows.map((r) => {
    const answers = objectOf(r.answers);
    const answerSummary = summarizeHomeSurveyAnswers(answers);
    const openTextSummary = [
      sanitizeHomeSurveyText(answers.topFixOne, 240),
      sanitizeHomeSurveyText(answers.finalSuggestion, 240),
      previewText(r.freeText, 240),
    ].filter(Boolean);
    return {
      surveyKey: String(r.surveyKey ?? ""),
      surveyVersion: String(r.surveyVersion ?? ""),
      overallRating: r.overallRating == null ? null : n(r.overallRating),
      recommendScore: r.recommendScore == null ? null : n(r.recommendScore),
      experienceStage: text(answers.experienceStage) || null,
      quitReason: text(answers.quitReason) || null,
      saveLossConcern: text(answers.saveLossConcern) || null,
      topFixPreview: previewText(answers.topFixOne),
      finalSuggestionPreview: sanitizeHomeSurveyText(answers.finalSuggestion, 240),
      freeTextPreview: previewText(r.freeText, 240),
      openTextSummary,
      answerSummary,
      createdAt: iso(r.createdAt),
      ...surveyRiskFlags(r),
    };
  });
  const aiRow = rowsOf(aiRaw)[0] ?? {};
  const aiExperience = {
    requestCount: n(aiRow.requestCount),
    avgLatency: n(aiRow.avgLatency),
    failureCount: n(aiRow.failureCount),
    fallbackCount: n(aiRow.fallbackCount),
    slowRequestCount: n(aiRow.slowRequestCount),
    tokenCost: n(aiRow.tokenCost),
  };
  const contentPath = {
    worlds: rowsOf(worldsRaw).map((r) => ({
      worldId: String(r.worldId ?? "unknown"),
      count: n(r.count),
      lastEventAt: iso(r.lastEventAt),
    })),
    chapters: rowsOf(chaptersRaw).map((r) => ({
      worldId: String(r.worldId ?? "unknown"),
      chapterId: String(r.chapterId ?? "unknown"),
      entered: n(r.entered),
      completed: n(r.completed),
      abandoned: n(r.abandoned),
      lastEventAt: iso(r.lastEventAt),
    })),
    npcs: rowsOf(npcsRaw).map((r) => ({
      npcId: String(r.npcId ?? "unknown"),
      started: n(r.started),
      completed: n(r.completed),
      failed: n(r.failed),
      lastEventAt: iso(r.lastEventAt),
    })),
  };
  const recentEvents = rowsOf(eventsRaw).map((r) => ({
    eventName: String(r.eventName ?? ""),
    eventTime: iso(r.eventTime),
    page: r.page ? String(r.page) : null,
    source: r.source ? String(r.source) : null,
    payloadSummary: summarizePayload(r.payload),
  }));
  const feedbackAndSurvey = {
    recentFeedback,
    recentSurvey,
    negativeFeedbackCount: recentFeedback.filter((r) => r.negative).length,
    negativeSurveyCount: recentSurvey.filter((r) => r.negative).length,
    saveAnxietyCount: recentSurvey.filter((r) => r.saveAnxiety).length,
  };
  const signals = buildAdminUserDetailSignals({
    basic,
    recentEvents,
    feedbackAndSurvey,
    aiExperience,
    contentPath,
  });
  return {
    actorKey,
    basic,
    journeyStage: signals.journeyStage,
    contentPath,
    aiExperience,
    feedbackAndSurvey,
    riskTags: signals.riskTags,
    suggestedOpsActions: signals.suggestedOpsActions,
    recentFeedback,
    recentSurvey,
    recentSettlements: rowsOf(settlementRaw).map((r) => ({
      grade: String(r.grade ?? ""),
      survivalTimeSeconds: n(r.survivalTimeSeconds),
      killedAnomalies: n(r.killedAnomalies),
      maxFloorLabel: String(r.maxFloorLabel ?? ""),
      createdAt: iso(r.createdAt),
    })),
    recentEvents,
  };
}
