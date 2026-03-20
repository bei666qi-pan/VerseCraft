import "server-only";

import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminMetricsDaily, analyticsEvents, feedbacks, userDailyActivity, users } from "@/db/schema";
import type { AdminTimeRange } from "@/lib/admin/timeRange";
import { getOnlineUsersFromPresence } from "@/lib/presence";
import { getAdminChartData } from "@/lib/adminDailyMetrics";
import { getAdminRealtimeMetrics } from "@/lib/analytics/realtime";

export async function getDashboardTableData() {
  const rows = await db
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
  const latestFeedbackRows = await db
    .select({
      userId: feedbacks.userId,
      content: feedbacks.content,
      createdAt: feedbacks.createdAt,
    })
    .from(feedbacks)
    .orderBy(desc(feedbacks.createdAt));

  const latestFeedbackMap = new Map<string, { content: string; createdAt: Date | null }>();
  for (const item of latestFeedbackRows) {
    if (!latestFeedbackMap.has(item.userId)) {
      latestFeedbackMap.set(item.userId, { content: item.content, createdAt: item.createdAt });
    }
  }

  const onlineSet = new Set(onlineIds);
  const tableRows = rows.map((u) => {
    const latest = latestFeedbackMap.get(u.id);
    return {
      ...u,
      lastActive: u.lastActive instanceof Date ? u.lastActive.toISOString() : String(u.lastActive),
      isOnline: onlineSet.has(u.id) ? 1 : 0,
      feedbackPreview: latest ? latest.content.slice(0, 6) : "",
      feedbackContent: latest?.content ?? "",
      feedbackCreatedAt: latest?.createdAt ? new Date(latest.createdAt).toISOString() : null,
    };
  });

  const onlineCount = tableRows.filter((r) => r.isOnline === 1).length;
  const totalUsers = tableRows.length;
  const totalTokens = tableRows.reduce((sum, r) => sum + Number(r.tokensUsed ?? 0), 0);

  return { rows: tableRows, onlineCount, totalUsers, totalTokens };
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

  const avgTokenPerActive =
    Number(dailyAgg?.dau ?? 0) > 0 ? Number(dailyAgg?.tokenCost ?? 0) / Number(dailyAgg?.dau ?? 1) : 0;

  return {
    range,
    cards: {
      totalUsers: Number(lifeAgg?.totalUsers ?? 0),
      totalTokens: Number(lifeAgg?.totalTokens ?? 0),
      activeUsersRange: Number(dailyAgg?.dau ?? 0),
      newUsersRange: Number(dailyAgg?.newUsers ?? 0),
      tokenCostRange: Number(dailyAgg?.tokenCost ?? 0),
      avgTokenPerActive,
      feedbackCountRange: Number(dailyAgg?.feedbackCount ?? 0),
      gameCompletedRange: Number(dailyAgg?.gameCompleted ?? 0),
    },
    chartData: await getAdminChartData(14),
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
  const [newUsers] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.eventName} = 'user_registered' AND ${analyticsEvents.eventTime} >= ${range.start} AND ${analyticsEvents.eventTime} <= ${range.end}`);

  const d1Res = await db.execute(sql`
    WITH cohort AS (
      SELECT DISTINCT user_id, DATE(event_time) AS reg_day
      FROM analytics_events
      WHERE event_name = 'user_registered'
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
    )
    SELECT COUNT(*)::int AS count
    FROM cohort c
    WHERE EXISTS (
      SELECT 1 FROM user_daily_activity a
      WHERE a.user_id = c.user_id
        AND a.date_key = c.reg_day + INTERVAL '1 day'
    )
  `);
  const d3Res = await db.execute(sql`
    WITH cohort AS (
      SELECT DISTINCT user_id, DATE(event_time) AS reg_day
      FROM analytics_events
      WHERE event_name = 'user_registered'
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
    )
    SELECT COUNT(*)::int AS count
    FROM cohort c
    WHERE EXISTS (
      SELECT 1 FROM user_daily_activity a
      WHERE a.user_id = c.user_id
        AND a.date_key = c.reg_day + INTERVAL '3 day'
    )
  `);
  const d7Res = await db.execute(sql`
    WITH cohort AS (
      SELECT DISTINCT user_id, DATE(event_time) AS reg_day
      FROM analytics_events
      WHERE event_name = 'user_registered'
        AND event_time >= ${range.start}
        AND event_time <= ${range.end}
    )
    SELECT COUNT(*)::int AS count
    FROM cohort c
    WHERE EXISTS (
      SELECT 1 FROM user_daily_activity a
      WHERE a.user_id = c.user_id
        AND a.date_key = c.reg_day + INTERVAL '7 day'
    )
  `);

  const returningRes = await db.execute(sql`
    WITH active_window AS (
      SELECT DISTINCT user_id FROM user_daily_activity
      WHERE date_key >= ${range.startDateKey}::date AND date_key <= ${range.endDateKey}::date
    ),
    active_before AS (
      SELECT DISTINCT user_id FROM user_daily_activity
      WHERE date_key < ${range.startDateKey}::date - INTERVAL '7 day'
    )
    SELECT COUNT(*)::int AS count
    FROM active_window w
    INNER JOIN active_before b ON b.user_id = w.user_id
  `);

  const churnRes = await db.execute(sql`
    WITH active_before AS (
      SELECT DISTINCT user_id FROM user_daily_activity
      WHERE date_key >= ${range.startDateKey}::date - INTERVAL '30 day'
        AND date_key < ${range.startDateKey}::date
    ),
    active_window AS (
      SELECT DISTINCT user_id FROM user_daily_activity
      WHERE date_key >= ${range.startDateKey}::date AND date_key <= ${range.endDateKey}::date
    )
    SELECT COUNT(*)::int AS count
    FROM active_before b
    WHERE NOT EXISTS (SELECT 1 FROM active_window w WHERE w.user_id = b.user_id)
  `);

  const pickCount = (res: unknown): number => {
    const rows = (res as { rows?: Array<Record<string, unknown>> })?.rows;
    const value = rows?.[0]?.count;
    return Number(value ?? 0);
  };

  const cohortSize = Number(newUsers?.count ?? 0);
  const d1Count = pickCount(d1Res);
  const d3Count = pickCount(d3Res);
  const d7Count = pickCount(d7Res);
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

  const byEvent = new Map(rows.map((r) => [r.eventName, Number(r.users ?? 0)]));
  const base = Number(byEvent.get("user_registered") ?? 0);

  const stages = eventNames.map((name) => {
    const count = Number(byEvent.get(name) ?? 0);
    return {
      eventName: name,
      users: count,
      conversionRate: base > 0 ? count / base : 0,
    };
  });

  return { range, stages };
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

  return {
    range,
    totalFeedback: rows.length,
    negativeFeedback: negativeCount,
    topics: topicList,
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

