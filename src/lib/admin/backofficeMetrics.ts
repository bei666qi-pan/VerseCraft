import "server-only";

import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import type { AdminTimeRange } from "@/lib/admin/timeRange";
import { addAppDays, appDateLabel, appEndOfDayUtc, appStartOfDayUtc } from "@/lib/admin/appTimezone";
import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import { estimateUsdForUsage } from "@/lib/ai/governance/costModel";
import { normalizeAiLogicalRole } from "@/lib/ai/models/logicalRoles";
import { getAdminMetricDefinition } from "@/lib/admin/metricDefinitions";
import { decodeCursor, encodeCursor, safeRate } from "@/lib/admin/metricsUtils";
import {
  computeJourneyFunnelStages,
  normalizeJourneyFunnelEvents,
  type JourneyFunnelMode,
} from "@/lib/admin/journeyFunnel";
import { buildContentQualityMetricsSnapshot } from "@/lib/admin/contentQualityMetrics";
import { buildAdminUserDetailSignals } from "@/lib/admin/userDetailSignals";
import { getFeedbackInsights, getFunnelMetrics, getOverviewMetrics, getRealtimeMetrics, getRetentionMetrics } from "@/lib/admin/service";
import { getAdminLoginRateLimitHealth } from "@/lib/admin/loginRateLimit";
import { computeAdminCapacityEstimate } from "@/lib/admin/capacityEstimate";
import { anyAiProviderConfigured } from "@/lib/ai/config/env";
import { envRaw } from "@/lib/config/envRaw";
import { getChatQueueConfig } from "@/lib/chatQueue/config";
import { shouldQueueChatRequest } from "@/lib/chatQueue/service";
import { ONLINE_WINDOW_SECONDS } from "@/lib/presence/onlineWindow";

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
  /** 对比基线（例如"昨日同口径值"）。null 表示暂无可比数据，undefined 表示该指标未接入趋势对比。 */
  previousValue?: number | null;
  deltaAbs?: number | null;
  deltaPct?: number | null;
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

/**
 * 在 kpi() 基础上附加"对比基线"（默认是昨日同口径值），解决"全是数字但看不出该做什么"——
 * 没有基线/趋势的裸数字很难判断好坏。previousValue 传 null 表示昨日数据不足或不适用。
 */
function kpiWithTrend(input: {
  metricId: string;
  label?: string;
  value: number;
  previousValue: number | null;
  unit?: string;
  source?: string;
  definition?: string;
  updatedAt?: string | null;
}): AdminKpi {
  const base = kpi(input);
  const previousValue = input.previousValue;
  if (previousValue == null || !Number.isFinite(previousValue)) {
    return { ...base, previousValue: null, deltaAbs: null, deltaPct: null };
  }
  const deltaAbs = input.value - previousValue;
  const deltaPct = previousValue !== 0 ? deltaAbs / previousValue : null;
  return { ...base, previousValue, deltaAbs, deltaPct };
}

export async function getBackofficeOverview(range: AdminTimeRange) {
  const now = new Date();
  // "今日/昨日"边界统一按北京时间对齐（appTimezone.ts），不再依赖数据库会话时区的
  // CURRENT_DATE——这是"同一页面出现两套互不一致的今日定义"这一根因 bug 的修复点。
  const todayStart = appStartOfDayUtc(now);
  const todayEnd = appEndOfDayUtc(now);
  const yesterdayRef = addAppDays(now, -1);
  const yesterdayStart = appStartOfDayUtc(yesterdayRef);
  const yesterdayEnd = appEndOfDayUtc(yesterdayRef);
  // activeActorsToday 读的是 actor_daily_activity.date_key（既有 UTC 自然日约定），
  // 按 appTimezone.ts 顶部说明，这里刻意沿用 getUtcDateKey，不做北京对齐，
  // 避免和 date_key 列的写入口径产生新的不一致。
  const todayUtcKey = getUtcDateKey(now);
  const yesterdayUtcKey = getUtcDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const todayBeijingKey = appDateLabel(now);
  const yesterdayBeijingKey = appDateLabel(addAppDays(now, -1));

  const [overview, realtime, guestRaw, aiRaw, actorsRaw, trafficRaw, updatedAtRaw] = await Promise.all([
    getOverviewMetrics(range),
    getRealtimeMetrics().catch(() => null),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE first_seen_at >= ${todayStart} AND first_seen_at <= ${todayEnd})::int AS "todayCount",
        COUNT(*) FILTER (WHERE first_seen_at >= ${yesterdayStart} AND first_seen_at <= ${yesterdayEnd})::int AS "yesterdayCount"
      FROM guest_registry
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE event_time >= ${todayStart} AND event_time <= ${todayEnd} AND event_name = 'chat_request_finished')::int AS "totalToday",
        COUNT(*) FILTER (WHERE event_time >= ${todayStart} AND event_time <= ${todayEnd} AND event_name = 'chat_request_finished' AND payload->>'success' = 'true')::int AS "successToday",
        COUNT(*) FILTER (WHERE event_time >= ${todayStart} AND event_time <= ${todayEnd} AND event_name = 'chat_request_finished' AND payload->>'success' = 'false')::int AS "failedToday",
        COALESCE(SUM(token_cost) FILTER (WHERE event_time >= ${todayStart} AND event_time <= ${todayEnd} AND event_name = 'chat_request_finished'), 0)::int AS "tokenCostToday",
        COUNT(*) FILTER (WHERE event_time >= ${yesterdayStart} AND event_time <= ${yesterdayEnd} AND event_name = 'chat_request_finished')::int AS "totalYesterday",
        COUNT(*) FILTER (WHERE event_time >= ${yesterdayStart} AND event_time <= ${yesterdayEnd} AND event_name = 'chat_request_finished' AND payload->>'success' = 'true')::int AS "successYesterday",
        COUNT(*) FILTER (WHERE event_time >= ${yesterdayStart} AND event_time <= ${yesterdayEnd} AND event_name = 'chat_request_finished' AND payload->>'success' = 'false')::int AS "failedYesterday",
        COALESCE(SUM(token_cost) FILTER (WHERE event_time >= ${yesterdayStart} AND event_time <= ${yesterdayEnd} AND event_name = 'chat_request_finished'), 0)::int AS "tokenCostYesterday"
      FROM analytics_events
      WHERE event_time >= ${yesterdayStart} AND event_time <= ${todayEnd}
        AND event_name = 'chat_request_finished'
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT
        COUNT(DISTINCT actor_id) FILTER (WHERE date_key = ${todayUtcKey}::date)::int AS "todayCount",
        COUNT(DISTINCT actor_id) FILTER (WHERE date_key = ${yesterdayUtcKey}::date)::int AS "yesterdayCount"
      FROM actor_daily_activity
      WHERE date_key IN (${todayUtcKey}::date, ${yesterdayUtcKey}::date)
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT date_key AS "dateKey", page_views AS "pageViews", unique_visitors AS "uniqueVisitors"
      FROM web_traffic_daily
      WHERE date_key IN (${todayBeijingKey}::date, ${yesterdayBeijingKey}::date)
    `).catch(() => ({ rows: [] })),
    db.execute(sql`SELECT MAX(updated_at) AS "adminMetricsUpdatedAt" FROM admin_metrics_daily`).catch(() => ({ rows: [] })),
  ]);

  const guestRow = rowsOf(guestRaw)[0] ?? {};
  const aiRow = rowsOf(aiRaw)[0] ?? {};
  const actorsRow = rowsOf(actorsRaw)[0] ?? {};
  const trafficByDate = new Map(rowsOf(trafficRaw).map((row) => [String(row.dateKey ?? ""), row]));
  const trafficToday = trafficByDate.get(todayBeijingKey) ?? {};
  const trafficYesterday = trafficByDate.get(yesterdayBeijingKey) ?? {};
  const updatedAt = iso(rowsOf(updatedAtRaw)[0]?.adminMetricsUpdatedAt) ?? new Date().toISOString();
  const nowIso = new Date().toISOString();

  const aiTotalToday = n(aiRow.totalToday);
  const aiSuccessToday = n(aiRow.successToday);
  const aiFailedToday = n(aiRow.failedToday);
  const aiTotalYesterday = n(aiRow.totalYesterday);
  const aiSuccessYesterday = n(aiRow.successYesterday);
  const aiFailedYesterday = n(aiRow.failedYesterday);

  return {
    ...overview,
    updatedAt,
    kpis: [
      kpiWithTrend({
        metricId: "overview.page_views_today",
        value: n(trafficToday.pageViews),
        previousValue: n(trafficYesterday.pageViews),
        source: "web_traffic_daily",
        definition: "page_viewed 产品事件数；按北京时间自然日汇总。",
        updatedAt: nowIso,
      }),
      kpiWithTrend({
        metricId: "overview.unique_visitors_today",
        value: n(trafficToday.uniqueVisitors),
        previousValue: n(trafficYesterday.uniqueVisitors),
        source: "web_traffic_daily",
        definition: "page_viewed 的匿名浏览器 visitorId 去重数；按北京时间自然日汇总。",
        updatedAt: nowIso,
      }),
      kpi({ metricId: "overview.new_registered_today", value: overview.cards.todayNewUsers, updatedAt }),
      kpiWithTrend({
        metricId: "overview.new_guests_today",
        value: n(guestRow.todayCount),
        previousValue: n(guestRow.yesterdayCount),
        updatedAt: nowIso,
      }),
      kpiWithTrend({
        metricId: "overview.active_actors_today",
        value: n(actorsRow.todayCount),
        previousValue: n(actorsRow.yesterdayCount),
        updatedAt: nowIso,
      }),
      kpiWithTrend({
        metricId: "overview.ai_success_rate_today",
        value: aiTotalToday > 0 ? safeRate(aiSuccessToday, aiTotalToday) : 0,
        previousValue: aiTotalYesterday > 0 ? safeRate(aiSuccessYesterday, aiTotalYesterday) : null,
        unit: "ratio",
        updatedAt: nowIso,
      }),
      kpiWithTrend({
        metricId: "overview.ai_failure_rate_today",
        value: aiTotalToday > 0 ? safeRate(aiFailedToday, aiTotalToday) : 0,
        previousValue: aiTotalYesterday > 0 ? safeRate(aiFailedYesterday, aiTotalYesterday) : null,
        unit: "failure_ratio",
        updatedAt: nowIso,
      }),
      kpi({
        metricId: "overview.online_registered_current",
        label: "当前在线注册用户",
        value: n(realtime?.onlineUsers),
        source: "presence",
        definition: "presence 近窗口在线注册用户。",
        updatedAt: nowIso,
        degraded: !realtime,
        reason: realtime ? null : "presence_unavailable",
      } as AdminKpi),
      kpi({
        metricId: "overview.online_guests_current",
        label: "当前在线游客",
        value: n(realtime?.onlineGuests),
        source: "presence",
        definition: "presence 近窗口在线游客会话。",
        updatedAt: nowIso,
        degraded: !realtime,
        reason: realtime ? null : "presence_unavailable",
      } as AdminKpi),
      kpiWithTrend({
        metricId: "overview.token_cost_today",
        label: "今日 AI 用量",
        value: n(aiRow.tokenCostToday),
        previousValue: n(aiRow.tokenCostYesterday),
        source: "analytics_events.token_cost",
        definition: "今日 AI 回合记录的用量求和（按北京自然日对齐）。",
        updatedAt: nowIso,
      }),
    ],
  };
}

export type NorthStarInputMetric = {
  metricId: string;
  label: string;
  value: number;
  unit?: string;
  definition: string;
};

/**
 * 北极星指标（North Star Metric）+ 输入指标 + 护栏指标（Sean Ellis 框架）。
 *
 * 之前的后台只有一堆并列的数字，没有一个"最能代表核心价值交付"的锚点指标，也没有对比基线——
 * 这是"全是数字但看不出该做什么"这类反馈的直接成因。这里选择 D1 留存率作为北极星指标：
 * 对 VerseCraft 这类单人叙事游戏，新玩家次日是否回来，是"是否被这段叙事体验留住"最直接、
 * 最难造假的信号，优于总注册数/总PV这类只会单调上涨的虚荣指标。
 *
 * 配套：
 * - 输入指标（可执行的杠杆）：拉新（分母）、新手引导转化率（早期流失点）、人均有效游玩时长（深度）。
 * - 护栏指标：AI 回合成功率——如果为了拉新/留存牺牲了 AI 体验稳定性，北极星数字会失真，
 *   必须同时看，不能只盯留存率本身。
 */
export async function getNorthStarMetrics(range: AdminTimeRange) {
  // 对比基线用"紧邻的上一个等长周期"，而不是裸数字——否则又会掉回"看不出好坏"的老问题。
  const durationMs = range.end.getTime() - range.start.getTime() + 1;
  const priorStart = new Date(range.start.getTime() - durationMs);
  const priorEnd = new Date(range.start.getTime() - 1);
  const priorRange: AdminTimeRange = {
    ...range,
    start: priorStart,
    end: priorEnd,
    startDateKey: getUtcDateKey(priorStart),
    endDateKey: getUtcDateKey(priorEnd),
  };

  const [retention, priorRetention, overview, funnel, aiExperience, guestsRaw] = await Promise.all([
    getRetentionMetrics(range).catch(() => null),
    getRetentionMetrics(priorRange).catch(() => null),
    getOverviewMetrics(range).catch(() => null),
    getFunnelMetrics(range).catch(() => null),
    getAiExperienceMetrics(range).catch(() => null),
    db
      .execute(
        sql`SELECT COUNT(*)::int AS count FROM guest_registry WHERE first_seen_at >= ${range.start} AND first_seen_at <= ${range.end}`
      )
      .catch(() => ({ rows: [] })),
  ]);

  const cohortSize = retention?.cohortSize ?? 0;
  const northStar = {
    metricId: "north_star.d1_retention",
    label: "北极星指标：次日留存率（D1 Retention）",
    definition:
      "本周期内首次注册/首次出现的账号或游客，在次日（北京自然日）再次活跃的比例；是判断新玩家是否被叙事体验留住的最直接信号。",
    value: retention?.d1.rate ?? null,
    unit: "ratio" as const,
    previousValue: priorRetention && priorRetention.cohortSize > 0 ? priorRetention.d1.rate : null,
    cohortSize,
    evidenceSufficiency: cohortSize >= 20 ? ("enough" as const) : ("insufficient" as const),
    degraded: !retention,
    updatedAt: new Date().toISOString(),
  };

  const newGuests = n(rowsOf(guestsRaw)[0]?.count);
  const newRegistered = overview?.cards.newUsersRange ?? 0;
  const onboardingEnd = funnel?.stages.find((s) => s.eventName === "enter_main_game") ?? null;
  const onboardingStart = funnel?.stages[0] ?? null;

  const inputMetrics: NorthStarInputMetric[] = [
    {
      metricId: "north_star.input.new_actors",
      label: "拉新：新增注册 + 新增游客",
      value: newRegistered + newGuests,
      definition: `本周期新增注册用户(${newRegistered}) + 新增游客(${newGuests})，是北极星指标留存分母的来源。`,
    },
    {
      metricId: "north_star.input.onboarding_conversion",
      label: "新手引导转化率",
      value: onboardingEnd && onboardingStart ? safeRate(onboardingEnd.all, onboardingStart.all) : 0,
      unit: "ratio",
      definition: "从漏斗第一阶段到「进入主游戏」的转化率，反映新手引导是否顺畅——是留存率的主要早期杠杆。",
    },
    {
      metricId: "north_star.input.active_play_duration_per_user",
      label: "人均有效游玩时长",
      value: overview ? safeRate(overview.cards.playDurationRangeSec, Math.max(1, overview.cards.activeUsersRange)) : 0,
      unit: "sec_per_user",
      definition: "周期内有效游玩秒数总和 / 活跃用户数，反映参与深度而非只看是否打开过。",
    },
    {
      metricId: "north_star.guardrail.ai_success_rate",
      label: "护栏指标：AI 回合成功率",
      value: aiExperience?.rates.successRate ?? 0,
      unit: "ratio",
      definition: "护栏指标：如果为了拉新/留存牺牲了 AI 体验稳定性（成功率下滑），北极星数字会失真，必须同时监控，不能只看留存率本身。",
    },
  ];

  return {
    range,
    northStar,
    inputMetrics,
    updatedAt: new Date().toISOString(),
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
    SELECT stage, actor_key AS "actorKey", first_at AS "firstAt"
    FROM normalized
  `);
  const normalizedEvents = normalizeJourneyFunnelEvents(
    rowsOf(raw).map((row) => ({
      stage: String(row.stage ?? ""),
      actorKey: String(row.actorKey ?? ""),
      firstAt: row.firstAt as Date | string | number | null,
    })),
    { actorType: "all", platform: "all" }
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
      COUNT(DISTINCT COALESCE(actor_id, session_id))::int AS "activeActors",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ttft_ms) AS "ttftP50",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY ttft_ms) AS "ttftP95",
      percentile_cont(0.99) WITHIN GROUP (ORDER BY ttft_ms) AS "ttftP99",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) AS "totalP50",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) AS "totalP95",
      percentile_cont(0.99) WITHIN GROUP (ORDER BY total_ms) AS "totalP99"
    FROM chat
  `);
  const row = rowsOf(raw)[0] ?? {};
  const sampleSize = n(row.sampleSize);
  const totalTokens = n(row.totalTokens);
  const activeActors = n(row.activeActors);
  const [topCostRaw, byRoleRaw, laneRaw, enqueueRaw] = await Promise.all([
    db.execute(sql`
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
    `).catch(() => ({ rows: [] })),
    // 按逻辑角色（chat_request_finished payload.model 存的就是 main/control/enhance/reasoner）
    // 拆分成本——之前 costModel.ts 里已有 USD 单价估算，但从未接入后台展示。
    db.execute(sql`
      SELECT
        COALESCE(payload->>'model', 'unknown') AS "role",
        COUNT(*)::int AS "requests",
        COALESCE(SUM(CASE WHEN (payload->>'promptTokens') ~ '^[0-9]+$' THEN (payload->>'promptTokens')::int ELSE 0 END), 0)::int AS "promptTokens",
        COALESCE(SUM(CASE WHEN (payload->>'completionTokens') ~ '^[0-9]+$' THEN (payload->>'completionTokens')::int ELSE 0 END), 0)::int AS "completionTokens",
        COALESCE(SUM(token_cost), 0)::int AS "totalTokens"
      FROM analytics_events
      WHERE event_name = 'chat_request_finished'
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      GROUP BY COALESCE(payload->>'model', 'unknown')
      ORDER BY "requests" DESC
    `).catch(() => ({ rows: [] })),
    // turn_lane_decided 此前只写入未被任何面板消费（后台重构调研发现的孤儿事件之一）。
    db.execute(sql`
      SELECT COALESCE(NULLIF(payload->>'lane', ''), 'unknown') AS "lane", COUNT(*)::int AS count
      FROM analytics_events
      WHERE event_name = 'turn_lane_decided'
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
      GROUP BY COALESCE(NULLIF(payload->>'lane', ''), 'unknown')
      ORDER BY count DESC
    `).catch(() => ({ rows: [] })),
    // world_engine_enqueued 同样此前未被消费；用它和 chat_action_completed 的比值衡量后台世界
    // 推进的触发频率，供 reasoner-health 之外再交叉核对一次。
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE event_name = 'world_engine_enqueued')::int AS "enqueued",
        COUNT(*) FILTER (WHERE event_name = 'chat_action_completed')::int AS "completedActions"
      FROM analytics_events
      WHERE event_time >= ${range.start}
        AND event_time <= ${range.end}
        AND event_name IN ('world_engine_enqueued', 'chat_action_completed')
    `).catch(() => ({ rows: [] })),
  ]);
  const costByRole = rowsOf(byRoleRaw).map((r) => {
    const roleRaw = String(r.role ?? "unknown");
    const role = normalizeAiLogicalRole(roleRaw) ?? "main";
    const promptTokens = n(r.promptTokens);
    const completionTokens = n(r.completionTokens);
    const totalTokensForRole = n(r.totalTokens);
    const estimatedUsd = estimateUsdForUsage(role, { promptTokens, completionTokens, totalTokens: totalTokensForRole });
    return {
      role: roleRaw,
      requests: n(r.requests),
      promptTokens,
      completionTokens,
      totalTokens: totalTokensForRole,
      estimatedUsd: Math.round(estimatedUsd * 10000) / 10000,
    };
  });
  const enqueueRow = rowsOf(enqueueRaw)[0] ?? {};
  const enqueuedCount = n(enqueueRow.enqueued);
  const completedActionCount = n(enqueueRow.completedActions);
  return {
    range,
    sampleSize,
    evidenceSufficiency: sampleSize >= 20 ? "enough" : "insufficient",
    metrics: [
      kpi({ metricId: "ai.ttft_p50", label: "首段等待中位数", value: row.ttftP50 == null ? null : Math.round(n(row.ttftP50)), unit: "ms", updatedAt: new Date().toISOString() } as AdminKpi),
      kpi({ metricId: "ai.ttft_p95", value: row.ttftP95 == null ? null : Math.round(n(row.ttftP95)), unit: "ms", updatedAt: new Date().toISOString() }),
      kpi({ metricId: "ai.ttft_p99", label: "首段等待 99 分位", value: row.ttftP99 == null ? null : Math.round(n(row.ttftP99)), unit: "ms", updatedAt: new Date().toISOString() } as AdminKpi),
      kpi({ metricId: "ai.total_latency_p50", label: "总耗时中位数", value: row.totalP50 == null ? null : Math.round(n(row.totalP50)), unit: "ms", updatedAt: new Date().toISOString() } as AdminKpi),
      kpi({ metricId: "ai.total_latency_p95", value: row.totalP95 == null ? null : Math.round(n(row.totalP95)), unit: "ms", updatedAt: new Date().toISOString() }),
      kpi({ metricId: "ai.total_latency_p99", label: "总耗时 99 分位", value: row.totalP99 == null ? null : Math.round(n(row.totalP99)), unit: "ms", updatedAt: new Date().toISOString() } as AdminKpi),
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
      /** 按逻辑角色(main/control/enhance/reasoner)拆分的请求数/token/预估USD成本。 */
      byRole: costByRole,
      estimatedTotalUsd: Math.round(costByRole.reduce((sum, r) => sum + r.estimatedUsd, 0) * 10000) / 10000,
    },
    /** 此前写入但从未被后台消费的两个事件，这里补上最小可用的聚合视图。 */
    turnLaneDistribution: rowsOf(laneRaw).map((r) => ({ lane: String(r.lane ?? "unknown"), count: n(r.count) })),
    worldEngineEnqueueRate: {
      enqueuedCount,
      completedActionCount,
      rate: safeRate(enqueuedCount, completedActionCount),
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
  let metaQueryFailed = false;
  const metaRaw = await withDeadline(db.execute(sql`
    SELECT
      (SELECT MAX(created_at) FROM admin_audit_logs WHERE action = 'admin_cron_rebuild_daily') AS "lastCronAt",
      (SELECT MAX(updated_at) FROM admin_metrics_daily) AS "aggregationFreshness",
      (SELECT COUNT(*)::int FROM analytics_events WHERE event_time >= NOW() - INTERVAL '1 hour' AND event_name LIKE '%failed%') AS "recentErrors",
      (SELECT COUNT(*)::int FROM analytics_events WHERE event_time >= NOW() - INTERVAL '1 hour' AND event_name = 'chat_request_finished') AS "recentAiRequests"
  `), 1200, "system_health_meta_timeout").catch((error) => {
    metaQueryFailed = true;
    console.warn("[admin][getSystemHealth] meta query failed, treating as degraded", error);
    return { rows: [] };
  });
  const meta = rowsOf(metaRaw)[0] ?? {};
  // 之前这里查询失败会被 .catch 静默吞掉、返回空对象，导致上层把 recentErrors 当成 0 展示
  // "系统健康"；现在显式记一条 degraded check，system-health/route.ts 里
  // `Object.values(data.checks).some(c => c.degraded)` 会自动把它计入整体降级判定。
  checks.metrics = {
    ok: !metaQueryFailed,
    degraded: metaQueryFailed,
    reason: metaQueryFailed ? "metrics_meta_query_failed" : null,
    updatedAt: new Date().toISOString(),
  };
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
        ('g:' || a.guest_id) AS actor_key,
        a.guest_id AS raw_id,
        CASE WHEN al.guest_no > 0 THEN ('游客' || al.guest_no::text) ELSE '游客' END AS display_name,
        'guest' AS actor_type,
        COALESCE(t.tokens_used, 0)::int AS tokens_used,
        COALESCE(t.play_time, 0)::int AS play_time,
        a.last_seen_at AS last_active,
        (a.last_seen_at >= NOW() - INTERVAL '90 seconds') AS is_online
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
      isOnline: Boolean(r.is_online),
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
        SELECT id AS "rawId", name, tokens_used AS "tokensUsed", play_time AS "playTime", last_active AS "lastActive", 'registered' AS "actorType"
        FROM users WHERE id = ${rawId} LIMIT 1
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
          -- T8 方案B（2026-07）：guest_daily_tokens 已下线，改读统一的 actor_daily_tokens。
          SELECT guest_id, COALESCE(SUM(daily_token_cost), 0)::int AS tokens_used
          FROM actor_daily_tokens
          WHERE actor_type = 'guest'
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
    return {
      surveyKey: String(r.surveyKey ?? ""),
      surveyVersion: String(r.surveyVersion ?? ""),
      overallRating: r.overallRating == null ? null : n(r.overallRating),
      recommendScore: r.recommendScore == null ? null : n(r.recommendScore),
      experienceStage: text(answers.experienceStage) || null,
      quitReason: text(answers.quitReason) || null,
      saveLossConcern: text(answers.saveLossConcern) || null,
      topFixPreview: previewText(answers.topFixOne),
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
