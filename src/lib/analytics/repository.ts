import "server-only";

import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { AnalyticsEventInsertInput } from "@/lib/analytics/types";
import { getUtcDateKey } from "@/lib/analytics/dateKeys";

/**
 * Insert analytics event only (idempotent).
 * Used by non-chat actions where aggregate rollups are not required yet.
 */
export async function insertAnalyticsEventIdempotent(input: AnalyticsEventInsertInput): Promise<void> {
  try {
    await db
      .insert(analyticsEvents)
      .values({
        eventId: input.eventId,
        userId: input.userId,
        sessionId: input.sessionId,
        eventName: input.eventName,
        eventTime: input.eventTime,
        page: input.page ?? null,
        source: input.source ?? null,
        platform: input.platform,
        tokenCost: input.tokenCost,
        playDurationDeltaSec: input.playDurationDeltaSec,
        payload: input.payload ?? {},
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: analyticsEvents.idempotencyKey });
  } catch (err) {
    // Best-effort telemetry: never break gameplay flow.
    console.error("[analytics][insertAnalyticsEventIdempotent] failed", err);
  }
}

export async function recordGenericAnalyticsEvent(
  input: AnalyticsEventInsertInput
): Promise<void> {
  await insertAnalyticsEventIdempotent(input);
}

export async function touchUserSessionHeartbeat(input: {
  sessionId: string;
  userId: string | null;
  page: string | null;
  eventTime?: Date;
}): Promise<void> {
  if (!input.sessionId) return;
  const eventTime = input.eventTime ?? new Date();
  try {
    await db.execute(sql`
      INSERT INTO user_sessions (
        session_id, user_id, started_at, last_seen_at, last_page,
        total_token_cost, total_play_duration_sec, chat_action_count, updated_at
      ) VALUES (
        ${input.sessionId},
        ${input.userId},
        ${eventTime},
        ${eventTime},
        ${input.page},
        0, 0, 0, CURRENT_TIMESTAMP
      )
      ON CONFLICT (session_id) DO UPDATE SET
        user_id = COALESCE(EXCLUDED.user_id, user_sessions.user_id),
        last_seen_at = GREATEST(user_sessions.last_seen_at, EXCLUDED.last_seen_at),
        last_page = COALESCE(EXCLUDED.last_page, user_sessions.last_page),
        updated_at = CURRENT_TIMESTAMP
    `);
  } catch (err) {
    console.error("[analytics][touchUserSessionHeartbeat] failed", err);
  }
}

/**
 * Chat completion ingestion with atomic rollup updates.
 * - idempotency is guaranteed by `analytics_events.idempotency_key`
 * - aggregate tables are updated only if the event insert succeeded
 */
export async function recordChatActionCompletedAnalytics(input: Omit<AnalyticsEventInsertInput, "eventName" | "eventTime"> & { eventTime?: Date }): Promise<void> {
  const eventTime = input.eventTime ?? new Date();
  const dateKey = getUtcDateKey(eventTime);

  // Guests currently don't have authenticated `userId`, so we only insert the event log for traceability.
  if (!input.userId) {
    await insertAnalyticsEventIdempotent({
      ...input,
      eventName: "chat_action_completed",
      eventTime,
    });
    return;
  }

  // Atomic rollup: only updates aggregates when analytics event was inserted.
  // We rely on CTE + EXISTS semantics to avoid double counting on retries.
  try {
    await db.execute(sql`
      WITH ins_event AS (
        INSERT INTO analytics_events (
          event_id, user_id, session_id, event_name, event_time, page, source, platform,
          token_cost, play_duration_delta_sec, payload, idempotency_key
        ) VALUES (
          ${input.eventId}, ${input.userId}, ${input.sessionId}, 'chat_action_completed',
          ${eventTime}, ${input.page}, ${input.source}, ${input.platform},
          ${input.tokenCost}, ${input.playDurationDeltaSec}, ${JSON.stringify(input.payload ?? {})}::jsonb,
          ${input.idempotencyKey}
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING event_id
      ),
      ins_session AS (
        INSERT INTO user_sessions (
          session_id, user_id, started_at, last_seen_at, last_page,
          total_token_cost, total_play_duration_sec, chat_action_count, updated_at
        )
        SELECT
          ${input.sessionId}, ${input.userId}, ${eventTime}, ${eventTime}, ${input.page},
          ${input.tokenCost}, ${input.playDurationDeltaSec}, 1, CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM ins_event)
          AND NOT EXISTS (SELECT 1 FROM user_sessions WHERE session_id = ${input.sessionId})
      ),
      upd_session AS (
        UPDATE user_sessions
        SET
          last_seen_at = GREATEST(last_seen_at, ${eventTime}),
          last_page = COALESCE(${input.page}, last_page),
          total_token_cost = total_token_cost + ${input.tokenCost},
          total_play_duration_sec = total_play_duration_sec + ${input.playDurationDeltaSec},
          chat_action_count = chat_action_count + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE session_id = ${input.sessionId}
          AND EXISTS (SELECT 1 FROM ins_event)
      ),
      ins_daily_activity AS (
        INSERT INTO user_daily_activity (
          user_id, date_key, first_active_at, last_active_at, chat_action_count
        )
        SELECT
          ${input.userId}, ${dateKey}::date, ${eventTime}, ${eventTime}, 1
        WHERE EXISTS (SELECT 1 FROM ins_event)
          AND NOT EXISTS (
            SELECT 1
            FROM user_daily_activity
            WHERE user_id = ${input.userId} AND date_key = ${dateKey}::date
          )
        RETURNING user_id
      ),
      upd_daily_activity AS (
        UPDATE user_daily_activity
        SET
          last_active_at = GREATEST(last_active_at, ${eventTime}),
          chat_action_count = chat_action_count + 1
        WHERE user_id = ${input.userId}
          AND date_key = ${dateKey}::date
          AND EXISTS (SELECT 1 FROM ins_event)
          AND NOT EXISTS (SELECT 1 FROM ins_daily_activity)
      ),
      upsert_daily_tokens AS (
        INSERT INTO user_daily_tokens (
          user_id, date_key, daily_token_cost, daily_play_duration_sec, chat_action_count
        )
        SELECT
          ${input.userId}, ${dateKey}::date, ${input.tokenCost}, ${input.playDurationDeltaSec}, 1
        WHERE EXISTS (SELECT 1 FROM ins_event)
        ON CONFLICT (user_id, date_key) DO UPDATE
        SET
          daily_token_cost = user_daily_tokens.daily_token_cost + EXCLUDED.daily_token_cost,
          daily_play_duration_sec = user_daily_tokens.daily_play_duration_sec + EXCLUDED.daily_play_duration_sec,
          chat_action_count = user_daily_tokens.chat_action_count + EXCLUDED.chat_action_count
      ),
      upsert_admin_daily AS (
        INSERT INTO admin_metrics_daily (
          date_key, dau, wau, mau, new_users,
          total_token_cost, total_play_duration_sec, chat_actions,
          feedback_submitted_count, game_completed_count, updated_at
        )
        SELECT
          ${dateKey}::date,
          (SELECT COUNT(*) FROM ins_daily_activity),
          0, 0, 0,
          ${input.tokenCost},
          ${input.playDurationDeltaSec},
          1,
          0, 0,
          CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM ins_event)
        ON CONFLICT (date_key) DO UPDATE
        SET
          dau = admin_metrics_daily.dau + EXCLUDED.dau,
          total_token_cost = admin_metrics_daily.total_token_cost + EXCLUDED.total_token_cost,
          total_play_duration_sec = admin_metrics_daily.total_play_duration_sec + EXCLUDED.total_play_duration_sec,
          chat_actions = admin_metrics_daily.chat_actions + EXCLUDED.chat_actions,
          updated_at = CURRENT_TIMESTAMP
      )
      SELECT 1;
    `);
  } catch (err) {
    console.error("[analytics][recordChatActionCompletedAnalytics] failed", err);
  }
}

export async function recordUserRegisteredAnalytics(input: Omit<AnalyticsEventInsertInput, "eventName" | "tokenCost" | "playDurationDeltaSec"> & { eventTime?: Date }): Promise<void> {
  const eventTime = input.eventTime ?? new Date();
  const dateKey = getUtcDateKey(eventTime);

  try {
    await db.execute(sql`
      WITH ins_event AS (
        INSERT INTO analytics_events (
          event_id, user_id, session_id, event_name, event_time, page, source, platform,
          token_cost, play_duration_delta_sec, payload, idempotency_key
        ) VALUES (
          ${input.eventId}, ${input.userId}, 'system', 'user_registered', ${eventTime},
          ${input.page}, ${input.source}, ${input.platform},
          0, 0, ${JSON.stringify(input.payload ?? {})}::jsonb, ${input.idempotencyKey}
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING event_id
      )
      INSERT INTO admin_metrics_daily (
        date_key, dau, wau, mau,
        new_users,
        total_token_cost, total_play_duration_sec, chat_actions,
        feedback_submitted_count, game_completed_count, updated_at
      )
      SELECT
        ${dateKey}::date, 0, 0, 0,
        1,
        0, 0, 0,
        0, 0,
        CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM ins_event)
      ON CONFLICT (date_key) DO UPDATE
      SET
        new_users = admin_metrics_daily.new_users + 1,
        updated_at = CURRENT_TIMESTAMP;
    `);
  } catch (err) {
    console.error("[analytics][recordUserRegisteredAnalytics] failed", err);
  }
}

export async function recordFeedbackSubmittedAnalytics(input: Omit<AnalyticsEventInsertInput, "eventName" | "tokenCost" | "playDurationDeltaSec"> & { eventTime?: Date }): Promise<void> {
  const eventTime = input.eventTime ?? new Date();
  const dateKey = getUtcDateKey(eventTime);

  try {
    await db.execute(sql`
      WITH ins_event AS (
        INSERT INTO analytics_events (
          event_id, user_id, session_id, event_name, event_time, page, source, platform,
          token_cost, play_duration_delta_sec, payload, idempotency_key
        ) VALUES (
          ${input.eventId}, ${input.userId}, 'system', 'feedback_submitted', ${eventTime},
          ${input.page}, ${input.source}, ${input.platform},
          0, 0, ${JSON.stringify(input.payload ?? {})}::jsonb, ${input.idempotencyKey}
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING event_id
      )
      INSERT INTO admin_metrics_daily (
        date_key, dau, wau, mau,
        new_users,
        total_token_cost, total_play_duration_sec, chat_actions,
        feedback_submitted_count, game_completed_count, updated_at
      )
      SELECT
        ${dateKey}::date, 0, 0, 0,
        0,
        0, 0, 0,
        1, 0,
        CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM ins_event)
      ON CONFLICT (date_key) DO UPDATE
      SET
        feedback_submitted_count = admin_metrics_daily.feedback_submitted_count + 1,
        updated_at = CURRENT_TIMESTAMP;
    `);
  } catch (err) {
    console.error("[analytics][recordFeedbackSubmittedAnalytics] failed", err);
  }
}

export async function recordGameRecordSubmittedAnalytics(input: Omit<AnalyticsEventInsertInput, "eventName" | "tokenCost" | "playDurationDeltaSec"> & { eventTime?: Date }): Promise<void> {
  const eventTime = input.eventTime ?? new Date();
  const dateKey = getUtcDateKey(eventTime);

  try {
    await db.execute(sql`
      WITH ins_event AS (
        INSERT INTO analytics_events (
          event_id, user_id, session_id, event_name, event_time, page, source, platform,
          token_cost, play_duration_delta_sec, payload, idempotency_key
        ) VALUES (
          ${input.eventId}, ${input.userId}, 'system', 'game_record_submitted', ${eventTime},
          ${input.page}, ${input.source}, ${input.platform},
          0, 0, ${JSON.stringify(input.payload ?? {})}::jsonb, ${input.idempotencyKey}
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING event_id
      )
      INSERT INTO admin_metrics_daily (
        date_key, dau, wau, mau,
        new_users,
        total_token_cost, total_play_duration_sec, chat_actions,
        feedback_submitted_count, game_completed_count, updated_at
      )
      SELECT
        ${dateKey}::date, 0, 0, 0,
        0,
        0, 0, 0,
        0, 1,
        CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM ins_event)
      ON CONFLICT (date_key) DO UPDATE
      SET
        game_completed_count = admin_metrics_daily.game_completed_count + 1,
        updated_at = CURRENT_TIMESTAMP;
    `);
  } catch (err) {
    console.error("[analytics][recordGameRecordSubmittedAnalytics] failed", err);
  }
}

export async function recordOnboardingViewedAnalytics(input: Omit<AnalyticsEventInsertInput, "eventName" | "tokenCost" | "playDurationDeltaSec"> & { eventTime?: Date }): Promise<void> {
  const eventTime = input.eventTime ?? new Date();
  try {
    await insertAnalyticsEventIdempotent({
      eventId: input.eventId,
      idempotencyKey: input.idempotencyKey,
      userId: input.userId,
      sessionId: "system",
      eventName: "onboarding_viewed",
      eventTime,
      page: input.page,
      source: input.source,
      platform: input.platform,
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: input.payload ?? {},
    });
  } catch (err) {
    console.error("[analytics][recordOnboardingViewedAnalytics] failed", err);
  }
}

