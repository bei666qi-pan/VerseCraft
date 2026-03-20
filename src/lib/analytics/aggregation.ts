import "server-only";

import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminMetricsDaily, analyticsEvents, userDailyActivity, userDailyTokens } from "@/db/schema";
import { getUtcDateKey, parseUtcDateKeyToDate } from "@/lib/analytics/dateKeys";

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
  const targetDate = parseUtcDateKeyToDate(dateKey);
  const wauStart = addDaysUtc(targetDate, -6);
  const mauStart = addDaysUtc(targetDate, -29);

  const wauStartKey = getUtcDateKey(wauStart);
  const mauStartKey = getUtcDateKey(mauStart);

  const [dauAgg] = await db
    .select({ dau: sql<number>`COUNT(DISTINCT ${userDailyActivity.userId})` })
    .from(userDailyActivity)
    .where(sql`${userDailyActivity.dateKey} = ${dateKey}::date`);

  const [wauAgg] = await db
    .select({ wau: sql<number>`COUNT(DISTINCT ${userDailyActivity.userId})` })
    .from(userDailyActivity)
    .where(sql`${userDailyActivity.dateKey} >= ${wauStartKey}::date AND ${userDailyActivity.dateKey} <= ${dateKey}::date`);

  const [mauAgg] = await db
    .select({ mau: sql<number>`COUNT(DISTINCT ${userDailyActivity.userId})` })
    .from(userDailyActivity)
    .where(sql`${userDailyActivity.dateKey} >= ${mauStartKey}::date AND ${userDailyActivity.dateKey} <= ${dateKey}::date`);

  const [
    tokensAgg,
  ] = await db
    .select({
      totalTokenCost: sql<number>`COALESCE(SUM(${userDailyTokens.dailyTokenCost}), 0)`,
      totalPlayDurationSec: sql<number>`COALESCE(SUM(${userDailyTokens.dailyPlayDurationSec}), 0)`,
      chatActions: sql<number>`COALESCE(SUM(${userDailyTokens.chatActionCount}), 0)`,
    })
    .from(userDailyTokens)
    .where(sql`${userDailyTokens.dateKey} = ${dateKey}::date`);

  const [
    newUsersAgg,
  ] = await db
    .select({
      newUsers: sql<number>`COUNT(*)`,
    })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.eventName} = 'user_registered' AND DATE(${analyticsEvents.eventTime}) = ${dateKey}::date`);

  const [
    feedbackAgg,
  ] = await db
    .select({
      feedbackSubmittedCount: sql<number>`COUNT(*)`,
    })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.eventName} = 'feedback_submitted' AND DATE(${analyticsEvents.eventTime}) = ${dateKey}::date`);

  const [
    gameAgg,
  ] = await db
    .select({
      gameCompletedCount: sql<number>`COUNT(*)`,
    })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.eventName} = 'game_record_submitted' AND DATE(${analyticsEvents.eventTime}) = ${dateKey}::date`);

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

