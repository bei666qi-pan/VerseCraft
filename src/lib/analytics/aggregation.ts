import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { actorDailyActivity, actorDailyTokens, analyticsEvents } from "@/db/schema";
import { getUtcDateKey, parseUtcDateKeyToDate } from "@/lib/analytics/dateKeys";
import { getBeijingDateKey, getBeijingDateRange, WEB_TRAFFIC_VISITOR_ID_SQL_PATTERN } from "@/lib/analytics/webTraffic";

export type AdminMetricsDailyRebuildResult = {
  dateKey: string;
  dau: number;
  wau: number;
  mau: number;
  newUsers: number;
  totalTokenCost: number;
  totalPlayDurationSec: number;
  chatActions: number;
  feedbackSubmittedCount: number;
  gameCompletedCount: number;
};

export type WebTrafficDailyRebuildResult = { dateKey: string; pageViews: number; uniqueVisitors: number };

/** Rebuild one Asia/Shanghai calendar day's PV/UV from the append-only event log. */
export async function rebuildWebTrafficDailyForDateKey(dateKey: string): Promise<WebTrafficDailyRebuildResult> {
  const { start, end } = getBeijingDateRange(dateKey);
  const result = await db.execute(sql`
    WITH traffic AS (
      SELECT
        COUNT(*)::int AS page_views,
        COUNT(DISTINCT CASE
          WHEN payload->>'visitorId' ~ ${WEB_TRAFFIC_VISITOR_ID_SQL_PATTERN}
          THEN payload->>'visitorId'
          ELSE NULL
        END)::int AS unique_visitors
      FROM analytics_events
      WHERE event_name = 'page_viewed' AND event_time >= ${start} AND event_time <= ${end}
    ), upserted AS (
      INSERT INTO web_traffic_daily (date_key, page_views, unique_visitors, updated_at)
      SELECT ${dateKey}::date, page_views, unique_visitors, CURRENT_TIMESTAMP FROM traffic
      ON CONFLICT (date_key) DO UPDATE SET
        page_views = EXCLUDED.page_views,
        unique_visitors = EXCLUDED.unique_visitors,
        updated_at = CURRENT_TIMESTAMP
      RETURNING page_views, unique_visitors
    )
    SELECT page_views AS "pageViews", unique_visitors AS "uniqueVisitors" FROM upserted
  `);
  const rows = Array.isArray(result) ? result : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const row = rows[0] ?? {};
  return { dateKey, pageViews: Number(row.pageViews ?? 0), uniqueVisitors: Number(row.uniqueVisitors ?? 0) };
}

function addDaysUtc(date: Date, deltaDays: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}

/**
 * Rebuild a single day of `admin_metrics_daily` from rollup tables + event log.
 * - Intended for backfill, reconciliation, and integrity checks.
 * - Idempotent: uses ON CONFLICT upsert with full overwrite.
 */
export async function rebuildAdminMetricsDailyForDateKey(dateKey: string): Promise<AdminMetricsDailyRebuildResult> {
  // 注：newUsersAgg/feedbackAgg/gameAgg 原先用 `DATE(event_time) = dateKey` 隐式依赖数据库
  // 会话时区做自然日比较；现在显式转成 `(event_time AT TIME ZONE 'UTC')::date`，
  // 与 dateKey（getUtcDateKey，纯 UTC 自然日）的既有写入口径保持确定性一致，
  // 不再受数据库会话 TimeZone 配置影响。这是健壮性修复，不改变既有语义。
  const targetDate = parseUtcDateKeyToDate(dateKey);
  const wauStart = addDaysUtc(targetDate, -6);
  const mauStart = addDaysUtc(targetDate, -29);

  const wauStartKey = getUtcDateKey(wauStart);
  const mauStartKey = getUtcDateKey(mauStart);

  // T8 方案B：DAU/WAU/MAU 与日 token/玩耍时长统计已从 `user_daily_activity` / `user_daily_tokens`
  // 切到统一的 `actor_daily_activity` / `actor_daily_tokens`（actor_type = 'user'，
  // 与旧口径一致——只统计注册用户，不含游客）。旧表仍继续写入，未下线。
  const [dauAgg] = await db
    .select({ dau: sql<number>`COUNT(DISTINCT ${actorDailyActivity.actorId})` })
    .from(actorDailyActivity)
    .where(sql`${actorDailyActivity.actorType} = 'user' AND ${actorDailyActivity.dateKey} = ${dateKey}::date`);

  const [wauAgg] = await db
    .select({ wau: sql<number>`COUNT(DISTINCT ${actorDailyActivity.actorId})` })
    .from(actorDailyActivity)
    .where(
      sql`${actorDailyActivity.actorType} = 'user' AND ${actorDailyActivity.dateKey} >= ${wauStartKey}::date AND ${actorDailyActivity.dateKey} <= ${dateKey}::date`
    );

  const [mauAgg] = await db
    .select({ mau: sql<number>`COUNT(DISTINCT ${actorDailyActivity.actorId})` })
    .from(actorDailyActivity)
    .where(
      sql`${actorDailyActivity.actorType} = 'user' AND ${actorDailyActivity.dateKey} >= ${mauStartKey}::date AND ${actorDailyActivity.dateKey} <= ${dateKey}::date`
    );

  const [
    tokensAgg,
  ] = await db
    .select({
      totalTokenCost: sql<number>`COALESCE(SUM(${actorDailyTokens.dailyTokenCost}), 0)`,
      totalPlayDurationSec: sql<number>`COALESCE(SUM(${actorDailyTokens.activePlaySec}), 0)`,
      chatActions: sql<number>`COALESCE(SUM(${actorDailyTokens.chatActionCount}), 0)`,
    })
    .from(actorDailyTokens)
    .where(sql`${actorDailyTokens.actorType} = 'user' AND ${actorDailyTokens.dateKey} = ${dateKey}::date`);

  const [
    newUsersAgg,
  ] = await db
    .select({
      newUsers: sql<number>`COUNT(*)`,
    })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.eventName} = 'user_registered' AND (${analyticsEvents.eventTime} AT TIME ZONE 'UTC')::date = ${dateKey}::date`);

  const [
    feedbackAgg,
  ] = await db
    .select({
      feedbackSubmittedCount: sql<number>`COUNT(*)`,
    })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.eventName} = 'feedback_submitted' AND (${analyticsEvents.eventTime} AT TIME ZONE 'UTC')::date = ${dateKey}::date`);

  const [
    gameAgg,
  ] = await db
    .select({
      gameCompletedCount: sql<number>`COUNT(*)`,
    })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.eventName} IN ('game_settlement', 'game_record_submitted') AND (${analyticsEvents.eventTime} AT TIME ZONE 'UTC')::date = ${dateKey}::date`);

  // Kept separate from legacy UTC admin_metrics_daily. Convert the UTC dateKey to the
  // corresponding Beijing dateKey (UTC midnight = 08:00 Beijing, same calendar day)
  // because web_traffic_daily uses Asia/Shanghai calendar-day labels.
  await rebuildWebTrafficDailyForDateKey(getBeijingDateKey(parseUtcDateKeyToDate(dateKey)));

  const result: AdminMetricsDailyRebuildResult = {
    dateKey,
    dau: Number(dauAgg?.dau ?? 0),
    wau: Number(wauAgg?.wau ?? 0),
    mau: Number(mauAgg?.mau ?? 0),
    newUsers: Number(newUsersAgg?.newUsers ?? 0),
    totalTokenCost: Number(tokensAgg?.totalTokenCost ?? 0),
    totalPlayDurationSec: Number(tokensAgg?.totalPlayDurationSec ?? 0),
    chatActions: Number(tokensAgg?.chatActions ?? 0),
    feedbackSubmittedCount: Number(feedbackAgg?.feedbackSubmittedCount ?? 0),
    gameCompletedCount: Number(gameAgg?.gameCompletedCount ?? 0),
  };

  await db.execute(sql`
    INSERT INTO admin_metrics_daily (
      date_key, dau, wau, mau,
      new_users,
      total_token_cost, total_play_duration_sec, chat_actions,
      feedback_submitted_count, game_completed_count, updated_at
    ) VALUES (
      ${dateKey}::date, ${result.dau}, ${result.wau}, ${result.mau},
      ${result.newUsers},
      ${result.totalTokenCost}, ${result.totalPlayDurationSec}, ${result.chatActions},
      ${result.feedbackSubmittedCount}, ${result.gameCompletedCount},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (date_key) DO UPDATE SET
      dau = EXCLUDED.dau,
      wau = EXCLUDED.wau,
      mau = EXCLUDED.mau,
      new_users = EXCLUDED.new_users,
      total_token_cost = EXCLUDED.total_token_cost,
      total_play_duration_sec = EXCLUDED.total_play_duration_sec,
      chat_actions = EXCLUDED.chat_actions,
      feedback_submitted_count = EXCLUDED.feedback_submitted_count,
      game_completed_count = EXCLUDED.game_completed_count,
      updated_at = CURRENT_TIMESTAMP
  `);

  return result;
}
