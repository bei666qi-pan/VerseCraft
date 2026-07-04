// src/lib/presence/actorRollupUpsert.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { buildActorIdentity } from "@/lib/analytics/actorIdentity";
import { getUtcDateKey } from "@/lib/adminDailyMetrics";
import { isPostgresUnavailableError, warnOptionalPostgresUnavailableOnce } from "@/lib/db/postgresErrors";

/**
 * T8 方案B（2026-07，旧表下线后)：心跳（无 chat action 的纯 presence 心跳）产生的
 * 播放时长写入 `actor_daily_activity`（日汇总）。`actor_sessions` 本身的读写已经
 * 直接内联在 `applyPresenceHeartbeat.ts`（它是唯一的会话表，承担了原来
 * `user_sessions`/`guest_sessions` 的存在性检查 + 心跳限流 + 会话计数职责），
 * 这里不再重复写 `actor_sessions`，只负责按天聚合。
 *
 * 语义映射说明（无法做到字段一一对应，是有意的简化，非疏漏）：
 * `total_play_duration_sec` 这类单一累计秒数统一计入 `active_play_sec`；
 * `online_sec`/`read_sec`/`idle_sec` 是预留细分字段，当前应用层没有逻辑区分，保持 0。
 */
export async function upsertActorDailyActivityHeartbeat(args: {
  userId: string | null;
  guestId: string | null;
  now: Date;
  playDeltaSec: number;
}): Promise<void> {
  const identity = buildActorIdentity({ userId: args.userId, guestId: args.guestId });
  if (!identity) return;
  const { actorId, actorType, userId, guestId } = identity;
  const playDelta = Math.max(0, Math.trunc(args.playDeltaSec) || 0);
  const dateKey = getUtcDateKey(args.now);

  try {
    await db.execute(sql`
      INSERT INTO actor_daily_activity (
        actor_id, actor_type, user_id, guest_id, date_key,
        first_active_at, last_active_at,
        session_count, chat_action_count,
        online_sec, active_play_sec, read_sec, idle_sec
      ) VALUES (
        ${actorId}, ${actorType}, ${userId}, ${guestId}, ${dateKey}::date,
        ${args.now}, ${args.now},
        0, 0,
        0, ${playDelta}, 0, 0
      )
      ON CONFLICT (actor_id, date_key) DO UPDATE SET
        last_active_at = GREATEST(actor_daily_activity.last_active_at, EXCLUDED.last_active_at),
        active_play_sec = actor_daily_activity.active_play_sec + EXCLUDED.active_play_sec
    `);
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      warnOptionalPostgresUnavailableOnce("actorRollup.dailyActivity");
      return;
    }
    console.error("[actorRollup] upsertActorDailyActivityHeartbeat failed", err);
  }
}

/**
 * `markUserActive()` 除了心跳路径之外还有别的调用方（chat route、telemetry actions、
 * heartbeat API），它们只需要"刷新这个 actor 名下所有会话的 last_seen_at"，不需要
 * 存在性检查/限流/播放时长——语义等价于原来 `touchUserSessionsLastSeenByUserId` /
 * `touchGuestSessionsLastSeenByGuestId` 对 `user_sessions`/`guest_sessions` 的操作，
 * 现在改为对 `actor_sessions` 做同样的"刷新该用户/游客名下所有会话"更新。
 */
export async function touchActorSessionsLastSeenByUserId(userId: string): Promise<void> {
  const t = new Date();
  try {
    await db.execute(sql`UPDATE actor_sessions SET last_seen_at = ${t}, updated_at = ${t} WHERE user_id = ${userId}`);
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      warnOptionalPostgresUnavailableOnce("actorRollup.touchByUserId");
      return;
    }
    console.error("[actorRollup] touchActorSessionsLastSeenByUserId failed", err);
  }
}

export async function touchActorSessionsLastSeenByGuestId(guestId: string): Promise<void> {
  const t = new Date();
  try {
    await db.execute(sql`UPDATE actor_sessions SET last_seen_at = ${t}, updated_at = ${t} WHERE guest_id = ${guestId}`);
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      warnOptionalPostgresUnavailableOnce("actorRollup.touchByGuestId");
      return;
    }
    console.error("[actorRollup] touchActorSessionsLastSeenByGuestId failed", err);
  }
}

/**
 * 心跳产生的播放时长（无 chat action 的场景）镜像写入 `actor_daily_tokens`，
 * 与 `recordChatActionCompletedAnalytics` 里 `upsert_actor_daily_tokens` 保持同构。
 * `dailyTokenCost` 恒为 0（token 消耗只在 chat action 完成时才产生，与旧的
 * `user_daily_tokens` / `guest_daily_tokens` 心跳写入路径行为一致）。
 */
export async function upsertActorDailyTokensFromPlayDelta(args: {
  userId: string | null;
  guestId: string | null;
  playDeltaSec: number;
  at: Date;
}): Promise<void> {
  const identity = buildActorIdentity({ userId: args.userId, guestId: args.guestId });
  if (!identity) return;
  const playDelta = Math.max(0, Math.trunc(args.playDeltaSec) || 0);
  if (playDelta <= 0) return;
  const { actorId, actorType, userId, guestId } = identity;
  const dateKey = getUtcDateKey(args.at);

  try {
    await db.execute(sql`
      INSERT INTO actor_daily_tokens (
        actor_id, actor_type, user_id, guest_id, date_key,
        daily_token_cost, chat_action_count, active_play_sec
      ) VALUES (
        ${actorId}, ${actorType}, ${userId}, ${guestId}, ${dateKey}::date,
        0, 0, ${playDelta}
      )
      ON CONFLICT (actor_id, date_key) DO UPDATE SET
        active_play_sec = actor_daily_tokens.active_play_sec + EXCLUDED.active_play_sec
    `);
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      warnOptionalPostgresUnavailableOnce("actorRollup.dailyTokens");
      return;
    }
    console.error("[actorRollup] upsertActorDailyTokensFromPlayDelta failed", err);
  }
}
