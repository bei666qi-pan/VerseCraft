import "server-only";

import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminMetricsDaily, analyticsEvents, feedbacks, surveyResponses, users } from "@/db/schema";
import type { AdminTimeRange } from "@/lib/admin/timeRange";
import { getOnlineUsersFromPresence } from "@/lib/presence";
import { getAdminChartData } from "@/lib/adminDailyMetrics";
import { getAdminRealtimeMetrics } from "@/lib/analytics/realtime";
import { computeFunnel, computeTokenStats } from "@/lib/admin/metricsUtils";
import {
  PRODUCT_SURVEY_KEY_HOME,
  DISCOVERY_SOURCE_OPTIONS,
  EXPERIENCE_STAGE_OPTIONS,
  CREATE_FRICTION_OPTIONS,
  IMMERSION_ISSUE_OPTIONS,
  CORE_FUN_POINT_OPTIONS,
  QUIT_REASON_OPTIONS,
  SAVE_LOSS_CONCERN_OPTIONS,
  RECOMMEND_WILLINGNESS_OPTIONS,
} from "@/lib/survey/productSurveyHomeV1";

function normalizeExecuteRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

type SurveyOption = { value: string; label: string };
type SurveyQuestionId =
  | "discoverySource"
  | "experienceStage"
  | "createFriction"
  | "immersionIssue"
  | "coreFunPoint"
  | "quitReason"
  | "saveLossConcern"
  | "recommendWillingness"
  | "topFixOne"
  | "finalSuggestion";

type SurveyAggregateQuestion = {
  id: SurveyQuestionId;
  title: string;
  kind: "single" | "text";
  sampleCount: number;
  options?: Array<{ value: string; label: string; count: number; pct: number }>;
  textCount?: number;
};

export type SurveyAggregateReport = {
  range: Pick<AdminTimeRange, "preset" | "start" | "end" | "startDateKey" | "endDateKey" | "label">;
  surveyKey: string;
  totalResponses: number;
  questions: SurveyAggregateQuestion[];
};

const HOME_SURVEY_META: Array<
  | { id: Exclude<SurveyQuestionId, "topFixOne" | "finalSuggestion">; kind: "single"; title: string; options: SurveyOption[] }
  | { id: "topFixOne" | "finalSuggestion"; kind: "text"; title: string }
> = [
  { id: "discoverySource", kind: "single", title: "你从哪里知道 VerseCraft？", options: DISCOVERY_SOURCE_OPTIONS },
  { id: "experienceStage", kind: "single", title: "你现在属于哪种体验阶段？", options: EXPERIENCE_STAGE_OPTIONS },
  { id: "createFriction", kind: "single", title: "角色创建流程里，哪个部分最容易让你犹豫或烦？", options: CREATE_FRICTION_OPTIONS },
  { id: "immersionIssue", kind: "single", title: "在正式游玩过程中，哪一种问题最影响你的沉浸感？", options: IMMERSION_ISSUE_OPTIONS },
  { id: "coreFunPoint", kind: "single", title: "你觉得当前“最好玩”的核心点是什么？", options: CORE_FUN_POINT_OPTIONS },
  { id: "quitReason", kind: "single", title: "如果你中途退出或今天不继续玩，最主要的原因会是什么？", options: QUIT_REASON_OPTIONS },
  { id: "topFixOne", kind: "text", title: "如果只能提一个最该优先修掉的问题" },
  { id: "saveLossConcern", kind: "single", title: "是否担心进度/历史/存档丢失？", options: SAVE_LOSS_CONCERN_OPTIONS },
  { id: "recommendWillingness", kind: "single", title: "是否愿意推荐朋友来玩？", options: RECOMMEND_WILLINGNESS_OPTIONS },
  { id: "finalSuggestion", kind: "text", title: "最后补充（可选）" },
];

function toPct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10; // 1 decimal
}

export async function getSurveyAggregate(range: AdminTimeRange): Promise<SurveyAggregateReport> {
  const raw = await db.execute(sql`
    SELECT answers
    FROM survey_responses
    WHERE survey_key = ${PRODUCT_SURVEY_KEY_HOME}
      AND created_at >= ${range.start}
      AND created_at <= ${range.end}
    ORDER BY created_at DESC
    LIMIT 5000
  `);
  const rows = normalizeExecuteRows(raw);
  const totalResponses = rows.length;

  const countsByQ = new Map<SurveyQuestionId, Map<string, number>>();
  const textCountByQ = new Map<Extract<SurveyQuestionId, "topFixOne" | "finalSuggestion">, number>();

  for (const row of rows) {
    const ans = row.answers;
    const a =
      ans && typeof ans === "object" && !Array.isArray(ans) ? (ans as Record<string, unknown>) : null;
    if (!a) continue;

    for (const q of HOME_SURVEY_META) {
      if (q.kind === "single") {
        const v = a[q.id];
        if (typeof v !== "string" || !v) continue;
        let m = countsByQ.get(q.id);
        if (!m) {
          m = new Map<string, number>();
          countsByQ.set(q.id, m);
        }
        m.set(v, (m.get(v) ?? 0) + 1);
      } else {
        const v = a[q.id];
        if (typeof v !== "string") continue;
        const t = v.trim();
        if (!t) continue;
        textCountByQ.set(q.id, (textCountByQ.get(q.id) ?? 0) + 1);
      }
    }
  }

  const questions: SurveyAggregateQuestion[] = HOME_SURVEY_META.map((q) => {
    if (q.kind === "text") {
      const c = textCountByQ.get(q.id) ?? 0;
      return {
        id: q.id,
        title: q.title,
        kind: "text",
        sampleCount: totalResponses,
        textCount: c,
      };
    }
    const m = countsByQ.get(q.id) ?? new Map<string, number>();
    const answered = [...m.values()].reduce((s, n) => s + n, 0);
    const options = q.options
      .map((opt) => {
        const count = m.get(opt.value) ?? 0;
        return { value: opt.value, label: opt.label, count, pct: toPct(count, answered) };
      })
      .filter((x) => x.count > 0 || answered === 0)
      .sort((a, b) => b.count - a.count);

    return {
      id: q.id,
      title: q.title,
      kind: "single",
      sampleCount: answered,
      options,
    };
  });

  return {
    range: {
      preset: range.preset,
      start: range.start,
      end: range.end,
      startDateKey: range.startDateKey,
      endDateKey: range.endDateKey,
      label: range.label,
    },
    surveyKey: PRODUCT_SURVEY_KEY_HOME,
    totalResponses,
    questions,
  };
}

export async function getDashboardTableData() {
  const userRows = await db
    .select({
      id: users.id,
      name: users.name,
      tokensUsed: users.tokensUsed,
      todayTokensUsed: users.todayTokensUsed,
      playTime: users.playTime,
      todayPlayTime: users.todayPlayTime,
      lastActive: users.lastActive,
    })
    .from(users)
    .orderBy(desc(users.tokensUsed));

  const { ids: onlineIds } = await getOnlineUsersFromPresence().catch(() => ({ ids: [], count: 0 }));
  // 避免全表拉取后在内存去重：改为 DISTINCT ON 每用户一条最新记录。
  const latestFeedbackRowsRaw = await db.execute(sql`
    SELECT DISTINCT ON (user_id)
      user_id AS "userId",
      content,
      created_at AS "createdAt"
    FROM feedbacks
    ORDER BY user_id, created_at DESC
  `);
  const latestGuestFeedbackRowsRaw = await db
    .execute(sql`
      SELECT DISTINCT ON (guest_id)
        guest_id AS "guestId",
        content,
        created_at AS "createdAt"
      FROM feedbacks
      WHERE guest_id IS NOT NULL AND guest_id <> '' AND user_id IS NULL
      ORDER BY guest_id, created_at DESC
    `)
    .catch((error) => {
      // 旧库可能还没有 guest_id 字段（42703）；此时后台降级为无游客反馈，不阻断页面。
      console.warn("[admin][getDashboardTableData] guest feedback query failed, fallback empty", error);
      return { rows: [] };
    });
  const latestSurveyRowsRaw = await db.execute(sql`
    SELECT DISTINCT ON (user_id)
      user_id AS "userId",
      survey_key AS "surveyKey",
      survey_version AS "surveyVersion",
      answers,
      free_text AS "freeText",
      overall_rating AS "overallRating",
      recommend_score AS "recommendScore",
      created_at AS "createdAt"
    FROM survey_responses
    WHERE user_id IS NOT NULL
    ORDER BY user_id, created_at DESC
  `);
  const latestGuestSurveyRowsRaw = await db
    .execute(sql`
      SELECT DISTINCT ON (guest_id)
        guest_id AS "guestId",
        survey_key AS "surveyKey",
        survey_version AS "surveyVersion",
        answers,
        free_text AS "freeText",
        overall_rating AS "overallRating",
        recommend_score AS "recommendScore",
        created_at AS "createdAt"
      FROM survey_responses
      WHERE guest_id IS NOT NULL AND guest_id <> '' AND user_id IS NULL
      ORDER BY guest_id, created_at DESC
    `)
    .catch((error) => {
      console.warn("[admin][getDashboardTableData] guest survey query failed, fallback empty", error);
      return { rows: [] };
    });

  const latestGameRowsRaw = await db
    .execute(sql`
      SELECT DISTINCT ON (user_id)
        user_id AS "userId",
        max_floor_score AS "maxFloorScore",
        survival_time_seconds AS "survivalTimeSeconds",
        created_at AS "createdAt"
      FROM game_records
      ORDER BY user_id, created_at DESC
    `)
    .catch((error) => {
      // Some local environments may not have game_records yet.
      console.warn("[admin][getDashboardTableData] game_records query failed, fallback empty", error);
      return { rows: [] };
    });

  const latestFeedbackRows = normalizeExecuteRows(latestFeedbackRowsRaw);
  const latestGuestFeedbackRows = normalizeExecuteRows(latestGuestFeedbackRowsRaw);
  const latestGameRows = normalizeExecuteRows(latestGameRowsRaw);

  const latestFeedbackMap = new Map<string, { content: string; createdAt: Date | null }>();
  for (const row of latestFeedbackRows) {
    const userId = String(row.userId ?? "");
    if (!userId) continue;
    latestFeedbackMap.set(userId, {
      content: String(row.content ?? ""),
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : null,
    });
  }
  const latestGuestFeedbackMap = new Map<string, { content: string; createdAt: Date | null }>();
  for (const row of latestGuestFeedbackRows) {
    const guestId = String(row.guestId ?? "");
    if (!guestId) continue;
    latestGuestFeedbackMap.set(guestId, {
      content: String(row.content ?? ""),
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : null,
    });
  }
  const latestSurveyMap = new Map<
    string,
    {
      surveyKey: string;
      surveyVersion: string;
      answers: Record<string, unknown>;
      freeText: string | null;
      overallRating: number | null;
      recommendScore: number | null;
      createdAt: Date | null;
    }
  >();
  const latestSurveyRows = normalizeExecuteRows(latestSurveyRowsRaw);
  for (const row of latestSurveyRows) {
    const userId = String(row.userId ?? "");
    if (!userId || latestSurveyMap.has(userId)) continue;
    latestSurveyMap.set(userId, {
      surveyKey: String(row.surveyKey ?? ""),
      surveyVersion: String(row.surveyVersion ?? ""),
      answers:
        row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)
          ? (row.answers as Record<string, unknown>)
          : {},
      freeText: row.freeText ? String(row.freeText) : null,
      overallRating: Number.isFinite(Number(row.overallRating)) ? Number(row.overallRating) : null,
      recommendScore: Number.isFinite(Number(row.recommendScore)) ? Number(row.recommendScore) : null,
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : null,
    });
  }

  const latestGuestSurveyMap = new Map<
    string,
    {
      surveyKey: string;
      surveyVersion: string;
      answers: Record<string, unknown>;
      freeText: string | null;
      overallRating: number | null;
      recommendScore: number | null;
      createdAt: Date | null;
    }
  >();
  const latestGuestSurveyRows = normalizeExecuteRows(latestGuestSurveyRowsRaw);
  for (const row of latestGuestSurveyRows) {
    const guestId = String(row.guestId ?? "");
    if (!guestId || latestGuestSurveyMap.has(guestId)) continue;
    latestGuestSurveyMap.set(guestId, {
      surveyKey: String(row.surveyKey ?? ""),
      surveyVersion: String(row.surveyVersion ?? ""),
      answers:
        row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)
          ? (row.answers as Record<string, unknown>)
          : {},
      freeText: row.freeText ? String(row.freeText) : null,
      overallRating: Number.isFinite(Number(row.overallRating)) ? Number(row.overallRating) : null,
      recommendScore: Number.isFinite(Number(row.recommendScore)) ? Number(row.recommendScore) : null,
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : null,
    });
  }
  const latestGameMap = new Map<string, { maxFloorScore: number; survivalTimeSeconds: number; createdAt: Date | null }>();
  for (const row of latestGameRows) {
    const userId = String(row.userId ?? "");
    if (!userId) continue;
    latestGameMap.set(userId, {
      maxFloorScore: Number(row.maxFloorScore ?? 0),
      survivalTimeSeconds: Number(row.survivalTimeSeconds ?? 0),
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : null,
    });
  }

  const onlineSet = new Set(onlineIds);
  const tableRows = userRows.map((u) => {
    const latest = latestFeedbackMap.get(u.id);
    const latestGame = latestGameMap.get(u.id);
    const latestSurvey = latestSurveyMap.get(u.id);
    return {
      ...u,
      lastActive: u.lastActive instanceof Date ? u.lastActive.toISOString() : String(u.lastActive),
      isOnline: onlineSet.has(u.id) ? 1 : 0,
      feedbackPreview: latest ? latest.content.slice(0, 6) : "",
      feedbackContent: latest?.content ?? "",
      feedbackCreatedAt: latest?.createdAt ? new Date(latest.createdAt).toISOString() : null,
      latestSurveyKey: latestSurvey?.surveyKey ?? null,
      latestSurveyVersion: latestSurvey?.surveyVersion ?? null,
      latestSurveyAnswers: latestSurvey?.answers ?? null,
      latestSurveyFreeText: latestSurvey?.freeText ?? null,
      latestSurveyOverallRating: latestSurvey?.overallRating ?? null,
      latestSurveyRecommendScore: latestSurvey?.recommendScore ?? null,
      latestSurveyCreatedAt: latestSurvey?.createdAt ? new Date(latestSurvey.createdAt).toISOString() : null,
      latestGameMaxFloor: latestGame?.maxFloorScore ?? null,
      latestGameSurvivalSec: latestGame?.survivalTimeSeconds ?? null,
      latestGameAt: latestGame?.createdAt ? new Date(latestGame.createdAt).toISOString() : null,
    };
  });

  // ---- Guests (anonymous) ----
  const guestAggRaw = await db
    .execute(sql`
      WITH guest_src AS (
        SELECT guest_id, created_at FROM feedbacks WHERE guest_id IS NOT NULL AND guest_id <> '' AND user_id IS NULL
        UNION ALL
        SELECT guest_id, created_at FROM survey_responses WHERE guest_id IS NOT NULL AND guest_id <> '' AND user_id IS NULL
        UNION ALL
        SELECT session_id AS guest_id, event_time AS created_at
        FROM analytics_events
        WHERE user_id IS NULL
          AND session_id IS NOT NULL
          AND session_id <> ''
          AND session_id NOT IN ('unknown_session', 'anon_session', 'browser_session', 'system')
        UNION ALL
        SELECT session_id AS guest_id, last_seen_at AS created_at
        FROM user_sessions
        WHERE user_id IS NULL
          AND session_id IS NOT NULL
          AND session_id <> ''
          AND session_id NOT IN ('unknown_session', 'anon_session', 'browser_session', 'system')
      ),
      guest_ids AS (
        SELECT guest_id, MAX(created_at) AS last_active
        FROM guest_src
        GROUP BY guest_id
      )
      INSERT INTO guest_aliases (guest_id)
      SELECT guest_id FROM guest_ids
      ON CONFLICT (guest_id) DO NOTHING
      RETURNING guest_id
    `)
    .catch((error) => {
      console.warn("[admin][getDashboardTableData] guest alias upsert failed, fallback empty", error);
      return { rows: [] };
    });
  void guestAggRaw;

  const guestRowsRaw = await db
    .execute(sql`
      WITH guest_src AS (
        SELECT guest_id, created_at FROM feedbacks WHERE guest_id IS NOT NULL AND guest_id <> '' AND user_id IS NULL
        UNION ALL
        SELECT guest_id, created_at FROM survey_responses WHERE guest_id IS NOT NULL AND guest_id <> '' AND user_id IS NULL
        UNION ALL
        SELECT session_id AS guest_id, event_time AS created_at
        FROM analytics_events
        WHERE user_id IS NULL
          AND session_id IS NOT NULL
          AND session_id <> ''
          AND session_id NOT IN ('unknown_session', 'anon_session', 'browser_session', 'system')
        UNION ALL
        SELECT session_id AS guest_id, last_seen_at AS created_at
        FROM user_sessions
        WHERE user_id IS NULL
          AND session_id IS NOT NULL
          AND session_id <> ''
          AND session_id NOT IN ('unknown_session', 'anon_session', 'browser_session', 'system')
      ),
      guest_ids AS (
        SELECT guest_id, MAX(created_at) AS last_active
        FROM guest_src
        GROUP BY guest_id
      )
      SELECT g.guest_id AS "guestId", a.guest_no AS "guestNo", g.last_active AS "lastActive"
      FROM guest_ids g
      INNER JOIN guest_aliases a ON a.guest_id = g.guest_id
      ORDER BY a.guest_no ASC
      LIMIT 2000
    `)
    .catch((error) => {
      console.warn("[admin][getDashboardTableData] guest rows query failed, fallback empty", error);
      return { rows: [] };
    });
  const guestRows = normalizeExecuteRows(guestRowsRaw);
  const guestTableRows = guestRows.map((g) => {
    const guestId = String(g.guestId ?? "");
    const guestNo = Number(g.guestNo ?? 0);
    const lastActive = g.lastActive ? new Date(String(g.lastActive)).toISOString() : new Date(0).toISOString();
    const latest = latestGuestFeedbackMap.get(guestId);
    const latestSurvey = latestGuestSurveyMap.get(guestId);
    return {
      id: `guest:${guestId}`,
      name: guestNo > 0 ? `游客${guestNo}` : "游客",
      tokensUsed: 0,
      todayTokensUsed: 0,
      playTime: 0,
      todayPlayTime: 0,
      lastActive,
      isOnline: onlineSet.has(guestId) || onlineSet.has(`guest_${guestId}`) ? 1 : 0,
      feedbackPreview: latest ? latest.content.slice(0, 6) : "",
      feedbackContent: latest?.content ?? "",
      feedbackCreatedAt: latest?.createdAt ? new Date(latest.createdAt).toISOString() : null,
      latestSurveyKey: latestSurvey?.surveyKey ?? null,
      latestSurveyVersion: latestSurvey?.surveyVersion ?? null,
      latestSurveyAnswers: latestSurvey?.answers ?? null,
      latestSurveyFreeText: latestSurvey?.freeText ?? null,
      latestSurveyOverallRating: latestSurvey?.overallRating ?? null,
      latestSurveyRecommendScore: latestSurvey?.recommendScore ?? null,
      latestSurveyCreatedAt: latestSurvey?.createdAt ? new Date(latestSurvey.createdAt).toISOString() : null,
      latestGameMaxFloor: null,
      latestGameSurvivalSec: null,
      latestGameAt: null,
    };
  });

  const allRows = [...guestTableRows, ...tableRows];
  const onlineCount = allRows.filter((r) => r.isOnline === 1).length;
  const totalUsers = allRows.length;
  const totalTokens = allRows.reduce((sum, r) => sum + Number(r.tokensUsed ?? 0), 0);

  return { rows: allRows, onlineCount, totalUsers, totalTokens };
}

export async function getOverviewMetrics(range: AdminTimeRange) {
  const [lifeAgg] = await db
    .select({
      totalUsers: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`COALESCE(SUM(${users.tokensUsed}), 0)`,
    })
    .from(users);

  const [dailyAgg] = await db
    .select({
      dau: sql<number>`COALESCE(SUM(${adminMetricsDaily.dau}), 0)`,
      newUsers: sql<number>`COALESCE(SUM(${adminMetricsDaily.newUsers}), 0)`,
      tokenCost: sql<number>`COALESCE(SUM(${adminMetricsDaily.totalTokenCost}), 0)`,
      feedbackCount: sql<number>`COALESCE(SUM(${adminMetricsDaily.feedbackSubmittedCount}), 0)`,
      gameCompleted: sql<number>`COALESCE(SUM(${adminMetricsDaily.gameCompletedCount}), 0)`,
    })
    .from(adminMetricsDaily)
    .where(sql`${adminMetricsDaily.dateKey} >= ${range.startDateKey}::date AND ${adminMetricsDaily.dateKey} <= ${range.endDateKey}::date`);
  const [latestDayAgg] = await db
    .select({
      dau: adminMetricsDaily.dau,
      wau: adminMetricsDaily.wau,
      mau: adminMetricsDaily.mau,
      newUsers: adminMetricsDaily.newUsers,
      tokenCost: adminMetricsDaily.totalTokenCost,
    })
    .from(adminMetricsDaily)
    .where(sql`${adminMetricsDaily.dateKey} = ${range.endDateKey}::date`)
    .limit(1);

  const tokenStats = computeTokenStats(Number(dailyAgg?.tokenCost ?? 0), Number(dailyAgg?.dau ?? 0));

  return {
    range,
    cards: {
      totalUsers: Number(lifeAgg?.totalUsers ?? 0),
      totalTokens: Number(lifeAgg?.totalTokens ?? 0),
      activeUsersRange: Number(dailyAgg?.dau ?? 0),
      newUsersRange: Number(dailyAgg?.newUsers ?? 0),
      tokenCostRange: Number(dailyAgg?.tokenCost ?? 0),
      avgTokenPerActive: tokenStats.tokenPerActive,
      feedbackCountRange: Number(dailyAgg?.feedbackCount ?? 0),
      gameCompletedRange: Number(dailyAgg?.gameCompleted ?? 0),
      todayNewUsers: Number(latestDayAgg?.newUsers ?? 0),
      todayTokenCost: Number(latestDayAgg?.tokenCost ?? 0),
      dau: Number(latestDayAgg?.dau ?? 0),
      wau: Number(latestDayAgg?.wau ?? 0),
      mau: Number(latestDayAgg?.mau ?? 0),
    },
    chartData: await getAdminChartData(
      Math.max(
        1,
        Math.min(
          60,
          Math.ceil((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000)) + 1
        )
      ),
      range.end
    ),
  };
}

export async function getRealtimeMetrics() {
  const base = await getAdminRealtimeMetrics();
  const [eventsAgg] = await db
    .select({
      m5: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventTime} >= NOW() - INTERVAL '5 minutes')`,
      m15: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventTime} >= NOW() - INTERVAL '15 minutes')`,
      m60: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventTime} >= NOW() - INTERVAL '60 minutes')`,
    })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.eventTime} >= NOW() - INTERVAL '60 minutes'`);

  return {
    ...base,
    trends: {
      eventsLast5m: Number(eventsAgg?.m5 ?? 0),
      eventsLast15m: Number(eventsAgg?.m15 ?? 0),
      eventsLast60m: Number(eventsAgg?.m60 ?? 0),
    },
  };
}

export async function getRetentionMetrics(range: AdminTimeRange) {
  /**
   * 留存口径修复：
   * - 历史只按注册用户（user_registered + user_daily_activity）统计，游客会被忽略导致“后台留存无数据”。
   * - 这里改为“用户 + 游客会话”统一活跃口径：
   *   user -> u:<user_id>, guest -> g:<session_id>。
   */
  const cohortRes = await db.execute(sql`
    WITH reg_users AS (
      SELECT DISTINCT
        ('u:' || user_id) AS actor_key,
        DATE(event_time) AS cohort_day
      FROM analytics_events
      WHERE event_name = 'user_registered'
        AND user_id IS NOT NULL
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
    ),
    guest_first_seen AS (
      SELECT
        ('g:' || session_id) AS actor_key,
        MIN(DATE(event_time)) AS cohort_day
      FROM analytics_events
      WHERE user_id IS NULL
        AND session_id IS NOT NULL
        AND session_id <> ''
        AND session_id NOT IN ('unknown_session', 'anon_session', 'browser_session', 'system')
      GROUP BY session_id
      HAVING MIN(event_time) >= ${range.start}
         AND MIN(event_time) <= ${range.end}
    ),
    cohort AS (
      SELECT actor_key, cohort_day FROM reg_users
      UNION
      SELECT actor_key, cohort_day FROM guest_first_seen
    ),
    active_days AS (
      SELECT DISTINCT ('u:' || user_id) AS actor_key, date_key::date AS active_day
      FROM user_daily_activity
      UNION
      SELECT DISTINCT ('g:' || session_id) AS actor_key, DATE(event_time) AS active_day
      FROM analytics_events
      WHERE user_id IS NULL
        AND session_id IS NOT NULL
        AND session_id <> ''
        AND session_id NOT IN ('unknown_session', 'anon_session', 'browser_session', 'system')
    )
    SELECT
      COUNT(*)::int AS cohort_size,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM active_days a
          WHERE a.actor_key = c.actor_key
            AND a.active_day = c.cohort_day + INTERVAL '1 day'
        )
      )::int AS d1_count,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM active_days a
          WHERE a.actor_key = c.actor_key
            AND a.active_day = c.cohort_day + INTERVAL '3 day'
        )
      )::int AS d3_count,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM active_days a
          WHERE a.actor_key = c.actor_key
            AND a.active_day = c.cohort_day + INTERVAL '7 day'
        )
      )::int AS d7_count
    FROM cohort c
  `);

  const returningRes = await db.execute(sql`
    WITH active_days AS (
      SELECT DISTINCT ('u:' || user_id) AS actor_key, date_key::date AS active_day
      FROM user_daily_activity
      UNION
      SELECT DISTINCT ('g:' || session_id) AS actor_key, DATE(event_time) AS active_day
      FROM analytics_events
      WHERE user_id IS NULL
        AND session_id IS NOT NULL
        AND session_id <> ''
        AND session_id NOT IN ('unknown_session', 'anon_session', 'browser_session', 'system')
    ),
    active_window AS (
      SELECT DISTINCT actor_key FROM active_days
      WHERE active_day >= ${range.startDateKey}::date AND active_day <= ${range.endDateKey}::date
    ),
    active_before AS (
      SELECT DISTINCT actor_key FROM active_days
      WHERE active_day < ${range.startDateKey}::date - INTERVAL '7 day'
    )
    SELECT COUNT(*)::int AS count
    FROM active_window w
    INNER JOIN active_before b ON b.actor_key = w.actor_key
  `);

  const churnRes = await db.execute(sql`
    WITH active_days AS (
      SELECT DISTINCT ('u:' || user_id) AS actor_key, date_key::date AS active_day
      FROM user_daily_activity
      UNION
      SELECT DISTINCT ('g:' || session_id) AS actor_key, DATE(event_time) AS active_day
      FROM analytics_events
      WHERE user_id IS NULL
        AND session_id IS NOT NULL
        AND session_id <> ''
        AND session_id NOT IN ('unknown_session', 'anon_session', 'browser_session', 'system')
    ),
    active_before AS (
      SELECT DISTINCT actor_key FROM active_days
      WHERE active_day >= ${range.startDateKey}::date - INTERVAL '30 day'
        AND active_day < ${range.startDateKey}::date
    ),
    active_window AS (
      SELECT DISTINCT actor_key FROM active_days
      WHERE active_day >= ${range.startDateKey}::date AND active_day <= ${range.endDateKey}::date
    )
    SELECT COUNT(*)::int AS count
    FROM active_before b
    WHERE NOT EXISTS (SELECT 1 FROM active_window w WHERE w.actor_key = b.actor_key)
  `);

  const pickCount = (res: unknown): number => {
    const rows = (res as { rows?: Array<Record<string, unknown>> })?.rows;
    const value = rows?.[0]?.count;
    return Number(value ?? 0);
  };

  const cohortRows = normalizeExecuteRows(cohortRes);
  const cohortFirst = cohortRows[0] ?? {};
  const cohortSize = Number(cohortFirst.cohort_size ?? 0);
  const d1Count = Number(cohortFirst.d1_count ?? 0);
  const d3Count = Number(cohortFirst.d3_count ?? 0);
  const d7Count = Number(cohortFirst.d7_count ?? 0);
  return {
    range,
    cohortSize,
    d1: { count: d1Count, rate: cohortSize > 0 ? d1Count / cohortSize : 0 },
    d3: { count: d3Count, rate: cohortSize > 0 ? d3Count / cohortSize : 0 },
    d7: { count: d7Count, rate: cohortSize > 0 ? d7Count / cohortSize : 0 },
    returningUsers: pickCount(returningRes),
    churnUsers: pickCount(churnRes),
  };
}

export async function getFunnelMetrics(range: AdminTimeRange) {
  const eventNames = [
    "user_registered",
    "create_character_success",
    "enter_main_game",
    "first_effective_action",
    "game_settlement",
    "feedback_submitted",
  ] as const;

  const EVENT_ZH: Record<(typeof eventNames)[number], string> = {
    user_registered: "注册成功",
    create_character_success: "创建角色成功",
    enter_main_game: "进入主游戏",
    first_effective_action: "首次有效行动",
    game_settlement: "结算到达",
    feedback_submitted: "提交反馈",
  };

  const rows = await db
    .select({
      eventName: analyticsEvents.eventName,
      users: sql<number>`COUNT(DISTINCT ${analyticsEvents.userId})`,
    })
    .from(analyticsEvents)
    .where(
      sql`${analyticsEvents.eventTime} >= ${range.start}
      AND ${analyticsEvents.eventTime} <= ${range.end}
      AND ${analyticsEvents.eventName} IN (${sql.raw(eventNames.map((x) => `'${x}'`).join(","))})`
    )
    .groupBy(analyticsEvents.eventName);

  const byEvent: Record<string, number> = {};
  for (const r of rows) byEvent[String(r.eventName)] = Number(r.users ?? 0);
  const stages = computeFunnel([...eventNames], byEvent);

  return {
    range,
    stages: stages.map((s) => ({
      ...s,
      eventLabel:
        (s.eventName && (EVENT_ZH as Record<string, string | undefined>)[String(s.eventName)]) ??
        String(s.eventName ?? ""),
    })),
  };
}

export async function getFeedbackInsights(range: AdminTimeRange) {
  const rows = await db
    .select({
      content: feedbacks.content,
      createdAt: feedbacks.createdAt,
    })
    .from(feedbacks)
    .where(sql`${feedbacks.createdAt} >= ${range.start} AND ${feedbacks.createdAt} <= ${range.end}`)
    .orderBy(desc(feedbacks.createdAt))
    .limit(1000);

  const negativeWords = ["差", "卡", "慢", "崩", "bug", "不好", "垃圾", "问题", "失败"];
  const topics: Record<string, number> = {
    性能卡顿: 0,
    剧情质量: 0,
    平衡数值: 0,
    界面体验: 0,
    登录账号: 0,
  };

  let negativeCount = 0;
  for (const r of rows) {
    const t = String(r.content ?? "").toLowerCase();
    if (negativeWords.some((w) => t.includes(w))) negativeCount += 1;
    if (/卡|慢|lag|延迟/.test(t)) topics["性能卡顿"] += 1;
    if (/剧情|文本|叙事|文案/.test(t)) topics["剧情质量"] += 1;
    if (/难|平衡|数值|太强|太弱/.test(t)) topics["平衡数值"] += 1;
    if (/ui|界面|按钮|样式/.test(t)) topics["界面体验"] += 1;
    if (/登录|注册|密码|账号/.test(t)) topics["登录账号"] += 1;
  }

  const topicList = Object.entries(topics)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
  const samples = rows
    .map((r) => String(r.content ?? "").trim())
    .filter(Boolean)
    .slice(0, 50);

  return {
    range,
    totalFeedback: rows.length,
    negativeFeedback: negativeCount,
    topics: topicList,
    samples,
  };
}

export async function getAiInsights(range: AdminTimeRange) {
  const [overview, retention, funnel, feedback] = await Promise.all([
    getOverviewMetrics(range),
    getRetentionMetrics(range),
    getFunnelMetrics(range),
    getFeedbackInsights(range),
  ]);

  const topDrop = (() => {
    const stages = funnel.stages;
    if (stages.length < 2) return null;
    let worst: { from: string; to: string; drop: number } | null = null;
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1]!;
      const cur = stages[i]!;
      const drop = prev.users - cur.users;
      if (!worst || drop > worst.drop) {
        worst = { from: prev.eventName, to: cur.eventName, drop };
      }
    }
    return worst;
  })();

  const suggestions: string[] = [];
  if (retention.d1.rate < 0.25) suggestions.push("D1 偏低，优先优化新手前 10 分钟引导与首次奖励反馈。");
  if (feedback.negativeFeedback > feedback.totalFeedback * 0.35) suggestions.push("负向反馈占比较高，建议优先处理性能与稳定性。");
  if (topDrop && topDrop.drop > 0) suggestions.push(`漏斗最大流失在 ${topDrop.from} -> ${topDrop.to}，建议定向埋点排查。`);
  if (suggestions.length === 0) suggestions.push("整体指标稳定，建议继续扩大样本并观察 7 日趋势。");

  return {
    range,
    model: "rule-based-insight-v1",
    summary: {
      totalUsers: overview.cards.totalUsers,
      activeUsersRange: overview.cards.activeUsersRange,
      d1Rate: retention.d1.rate,
      negativeFeedbackRate: feedback.totalFeedback > 0 ? feedback.negativeFeedback / feedback.totalFeedback : 0,
    },
    suggestions,
    trace: {
      topDrop,
      topFeedbackTopic: feedback.topics[0] ?? null,
    },
  };
}

