import "server-only";

import { db } from "@/db";
import { actorDailyActivity, actorDailyTokens, actorSessions, analyticsActors, analyticsEvents, userDailyActivity, userDailyTokens, userSessions } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { AnalyticsEventInsertInput } from "@/lib/analytics/types";
import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import { buildActorIdentity } from "@/lib/analytics/actorIdentity";

let analyticsTableMissingWarned = false;

function isPgUndefinedTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code === "42P01") return true;
  const cause = (err as { cause?: { code?: string } }).cause;
  if (cause && typeof cause === "object" && cause.code === "42P01") return true;
  return false;
}

/** Avoid log spam when DB predates analytics_events; gameplay must not depend on inserts. */
function suppressOrLogAnalyticsError(err: unknown, logLabel: string): void {
  if (isPgUndefinedTable(err)) {
    if (!analyticsTableMissingWarned) {
      analyticsTableMissingWarned = true;
      console.warn(
        "[analytics] analytics_events missing (42P01). Set MIGRATE_ON_BOOT=1 or run scripts/migrate.js on the server; further 42P01 noise suppressed."
      );
    }
    return;
  }
  console.error(logLabel, err);
}

/**
 * Insert analytics event only (idempotent).
 * Used by non-chat actions where aggregate rollups are not required yet.
 */
export async function insertAnalyticsEventIdempotent(input: AnalyticsEventInsertInput): Promise<void> {
  const actor = buildActorIdentity({ userId: input.userId, guestId: input.guestId ?? null });
  try {
    await db
      .insert(analyticsEvents)
      .values({
        eventId: input.eventId,
        actorId: input.actorId ?? actor?.actorId ?? null,
        actorType: input.actorType ?? actor?.actorType ?? null,
        guestId: input.guestId ?? actor?.guestId ?? null,
        userId: input.userId,
        sessionId: input.sessionId,
        eventName: input.eventName,
        eventTime: input.eventTime,
        page: input.page ?? null,
        source: input.source ?? null,
        platform: input.platform,
        tokenCost: input.tokenCost,
        playDurationDeltaSec: input.playDurationDeltaSec,
        onlineDurationDeltaSec: Math.max(0, Math.trunc(input.onlineDurationDeltaSec ?? 0)),
        activePlayDurationDeltaSec: Math.max(0, Math.trunc(input.activePlayDurationDeltaSec ?? 0)),
        readDurationDeltaSec: Math.max(0, Math.trunc(input.readDurationDeltaSec ?? 0)),
        idleDurationDeltaSec: Math.max(0, Math.trunc(input.idleDurationDeltaSec ?? 0)),
        payload: input.payload ?? {},
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: analyticsEvents.idempotencyKey });
  } catch (err) {
    suppressOrLogAnalyticsError(err, "[analytics][insertAnalyticsEventIdempotent] failed");
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
    suppressOrLogAnalyticsError(err, "[analytics][touchUserSessionHeartbeat] failed");
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
  const actor = buildActorIdentity({ userId: input.userId, guestId: input.guestId ?? null });
  const actorId = actor?.actorId ?? null;
  const actorType = actor?.actorType ?? null;

  // 统一：游客也要写入 session/日汇总；不再仅 event log。
  if (!actorId || !actorType) {
    await insertAnalyticsEventIdempotent({ ...input, eventName: "chat_action_completed", eventTime });
    return;
  }

  // Atomic rollup: only updates aggregates when analytics event was inserted.
  // We rely on CTE + EXISTS semantics to avoid double counting on retries.
  try {
    await db.execute(sql`
      WITH ins_event AS (
        INSERT INTO analytics_events (
          event_id, actor_id, actor_type, guest_id, user_id, session_id, event_name, event_time, page, source, platform,
          token_cost, play_duration_delta_sec, active_play_duration_delta_sec, payload, idempotency_key
        ) VALUES (
          ${input.eventId}, ${actorId}, ${actorType}, ${actor.guestId ?? null}, ${input.userId}, ${input.sessionId}, 'chat_action_completed',
          ${eventTime}, ${input.page}, ${input.source}, ${input.platform},
          ${input.tokenCost}, ${input.playDurationDeltaSec}, ${input.playDurationDeltaSec}, ${JSON.stringify(input.payload ?? {})}::jsonb,
          ${input.idempotencyKey}
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING event_id
      ),
      upsert_actor AS (
        INSERT INTO analytics_actors (actor_id, actor_type, user_id, guest_id, created_at, last_seen_at)
        SELECT ${actorId}, ${actorType}, ${input.userId}, ${actor.guestId ?? null}, ${eventTime}, ${eventTime}
        WHERE EXISTS (SELECT 1 FROM ins_event)
        ON CONFLICT (actor_id) DO UPDATE SET
          user_id = COALESCE(EXCLUDED.user_id, analytics_actors.user_id),
          guest_id = COALESCE(EXCLUDED.guest_id, analytics_actors.guest_id),
          last_seen_at = GREATEST(analytics_actors.last_seen_at, EXCLUDED.last_seen_at)
      ),
      upsert_actor_session AS (
        INSERT INTO actor_sessions (
          session_id, actor_id, actor_type, user_id, guest_id,
          started_at, last_seen_at, last_page,
          total_token_cost, chat_action_count,
          online_sec, active_play_sec, read_sec, idle_sec, updated_at
        )
        SELECT
          ${input.sessionId}, ${actorId}, ${actorType}, ${input.userId}, ${actor.guestId ?? null},
          ${eventTime}, ${eventTime}, ${input.page},
          ${input.tokenCost}, 1,
          0, ${input.playDurationDeltaSec}, 0, 0, CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM ins_event)
        ON CONFLICT (session_id) DO UPDATE SET
          actor_id = EXCLUDED.actor_id,
          actor_type = EXCLUDED.actor_type,
          user_id = COALESCE(EXCLUDED.user_id, actor_sessions.user_id),
          guest_id = COALESCE(EXCLUDED.guest_id, actor_sessions.guest_id),
          last_seen_at = GREATEST(actor_sessions.last_seen_at, EXCLUDED.last_seen_at),
          last_page = COALESCE(EXCLUDED.last_page, actor_sessions.last_page),
          total_token_cost = actor_sessions.total_token_cost + EXCLUDED.total_token_cost,
          chat_action_count = actor_sessions.chat_action_count + 1,
          active_play_sec = actor_sessions.active_play_sec + EXCLUDED.active_play_sec,
          updated_at = CURRENT_TIMESTAMP
      ),
      upsert_actor_daily_activity AS (
        INSERT INTO actor_daily_activity (
          actor_id, actor_type, user_id, guest_id, date_key,
          first_active_at, last_active_at,
          session_count, chat_action_count,
          online_sec, active_play_sec, read_sec, idle_sec
        )
        SELECT
          ${actorId}, ${actorType}, ${input.userId}, ${actor.guestId ?? null}, ${dateKey}::date,
          ${eventTime}, ${eventTime},
          0, 1,
          0, ${input.playDurationDeltaSec}, 0, 0
        WHERE EXISTS (SELECT 1 FROM ins_event)
        ON CONFLICT (actor_id, date_key) DO UPDATE SET
          last_active_at = GREATEST(actor_daily_activity.last_active_at, EXCLUDED.last_active_at),
          chat_action_count = actor_daily_activity.chat_action_count + 1,
          active_play_sec = actor_daily_activity.active_play_sec + EXCLUDED.active_play_sec
      ),
      upsert_actor_daily_tokens AS (
        INSERT INTO actor_daily_tokens (
          actor_id, actor_type, user_id, guest_id, date_key,
          daily_token_cost, chat_action_count, active_play_sec
        )
        SELECT
          ${actorId}, ${actorType}, ${input.userId}, ${actor.guestId ?? null}, ${dateKey}::date,
          ${input.tokenCost}, 1, ${input.playDurationDeltaSec}
        WHERE EXISTS (SELECT 1 FROM ins_event)
        ON CONFLICT (actor_id, date_key) DO UPDATE SET
          daily_token_cost = actor_daily_tokens.daily_token_cost + EXCLUDED.daily_token_cost,
          chat_action_count = actor_daily_tokens.chat_action_count + 1,
          active_play_sec = actor_daily_tokens.active_play_sec + EXCLUDED.active_play_sec
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
          AND ${input.userId} IS NOT NULL
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
          AND ${input.userId} IS NOT NULL
          AND EXISTS (SELECT 1 FROM ins_event)
      ),
      ins_daily_activity AS (
        INSERT INTO user_daily_activity (
          user_id, date_key, first_active_at, last_active_at, chat_action_count
        )
        SELECT
          ${input.userId}, ${dateKey}::date, ${eventTime}, ${eventTime}, 1
        WHERE EXISTS (SELECT 1 FROM ins_event)
          AND ${input.userId} IS NOT NULL
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
          AND ${input.userId} IS NOT NULL
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
          AND ${input.userId} IS NOT NULL
        ON CONFLICT (user_id, date_key) DO UPDATE
        SET
          daily_token_cost = user_daily_tokens.daily_token_cost + EXCLUDED.daily_token_cost,
          daily_play_duration_sec = user_daily_tokens.daily_play_duration_sec + EXCLUDED.daily_play_duration_sec,
          chat_action_count = user_daily_tokens.chat_action_count + EXCLUDED.chat_action_count
      ),
      touch_guest_registry AS (
        INSERT INTO guest_registry (guest_id, first_seen_at, last_seen_at, total_play_duration_sec, platform, updated_at)
        SELECT
          ${input.guestId}, ${eventTime}, ${eventTime}, 0, ${input.platform}, CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM ins_event)
          AND ${input.userId} IS NULL
          AND ${input.guestId} IS NOT NULL
        ON CONFLICT (guest_id) DO UPDATE SET
          last_seen_at = GREATEST(guest_registry.last_seen_at, EXCLUDED.last_seen_at),
          platform = COALESCE(EXCLUDED.platform, guest_registry.platform),
          updated_at = CURRENT_TIMESTAMP
      ),
      upsert_guest_daily_activity AS (
        INSERT INTO guest_daily_activity (guest_id, date_key, first_active_at, last_active_at, chat_action_count)
        SELECT
          ${input.guestId}, ${dateKey}::date, ${eventTime}, ${eventTime}, 1
        WHERE EXISTS (SELECT 1 FROM ins_event)
          AND ${input.userId} IS NULL
          AND ${input.guestId} IS NOT NULL
        ON CONFLICT (guest_id, date_key) DO UPDATE SET
          last_active_at = GREATEST(guest_daily_activity.last_active_at, EXCLUDED.last_active_at),
          chat_action_count = guest_daily_activity.chat_action_count + EXCLUDED.chat_action_count
      ),
      upsert_guest_daily_tokens AS (
        INSERT INTO guest_daily_tokens (guest_id, date_key, daily_token_cost, daily_play_duration_sec, chat_action_count)
        SELECT
          ${input.guestId}, ${dateKey}::date, ${input.tokenCost}, ${input.playDurationDeltaSec}, 1
        WHERE EXISTS (SELECT 1 FROM ins_event)
          AND ${input.userId} IS NULL
          AND ${input.guestId} IS NOT NULL
        ON CONFLICT (guest_id, date_key) DO UPDATE SET
          daily_token_cost = guest_daily_tokens.daily_token_cost + EXCLUDED.daily_token_cost,
          daily_play_duration_sec = guest_daily_tokens.daily_play_duration_sec + EXCLUDED.daily_play_duration_sec,
          chat_action_count = guest_daily_tokens.chat_action_count + EXCLUDED.chat_action_count
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
          AND ${input.userId} IS NOT NULL
        ON CONFLICT (date_key) DO UPDATE
        SET
          dau = admin_metrics_daily.dau + EXCLUDED.dau,
          total_token_cost = admin_metrics_daily.total_token_cost + EXCLUDED.total_token_cost,
          total_play_duration_sec = admin_metrics_daily.total_play_duration_sec + EXCLUDED.total_play_duration_sec,
          chat_actions = admin_metrics_daily.chat_actions + EXCLUDED.chat_actions,
          updated_at = CURRENT_TIMESTAMP
      ),
      upsert_admin_daily_guest AS (
        INSERT INTO admin_metrics_daily (
          date_key, dau, wau, mau, new_users,
          total_token_cost, total_play_duration_sec, chat_actions,
          feedback_submitted_count, game_completed_count, updated_at
        )
        SELECT
          ${dateKey}::date,
          0, 0, 0, 0,
          ${input.tokenCost},
          ${input.playDurationDeltaSec},
          1,
          0, 0,
          CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM ins_event)
          AND ${input.userId} IS NULL
          AND ${input.guestId} IS NOT NULL
        ON CONFLICT (date_key) DO UPDATE
        SET
          total_token_cost = admin_metrics_daily.total_token_cost + EXCLUDED.total_token_cost,
          total_play_duration_sec = admin_metrics_daily.total_play_duration_sec + EXCLUDED.total_play_duration_sec,
          chat_actions = admin_metrics_daily.chat_actions + EXCLUDED.chat_actions,
          updated_at = CURRENT_TIMESTAMP
      )
      SELECT 1;
    `);
  } catch (err) {
    suppressOrLogAnalyticsError(err, "[analytics][recordChatActionCompletedAnalytics] failed");
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
    suppressOrLogAnalyticsError(err, "[analytics][recordUserRegisteredAnalytics] failed");
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
    suppressOrLogAnalyticsError(err, "[analytics][recordFeedbackSubmittedAnalytics] failed");
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
    suppressOrLogAnalyticsError(err, "[analytics][recordGameRecordSubmittedAnalytics] failed");
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
    suppressOrLogAnalyticsError(err, "[analytics][recordOnboardingViewedAnalytics] failed");
  }
}

