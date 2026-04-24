// src/lib/presence.ts
import "server-only";

import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { userSessions } from "@/db/schema";

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result;
  return (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
}
import { DAILY_ACTIVE_SET_TTL_SECONDS, dailyActiveSetKey, getUtcDateKey } from "@/lib/adminDailyMetrics";
import { insertAnalyticsEventIdempotent } from "@/lib/analytics/repository";
import { mergeOnlineActorKeys, type MergedOnlineBreakdown } from "@/lib/presence/mergeOnlineActorKeys";
import { ONLINE_WINDOW_MS, ONLINE_WINDOW_SECONDS } from "@/lib/presence/onlineWindow";

const ACTIVE_USERS_KEY = "active_users";

let redis: ReturnType<typeof Redis.fromEnv> | null = null;
let missingEnvWarned = false;

function getRedis(): ReturnType<typeof Redis.fromEnv> | null {
  if (redis) return redis;
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  if (!url || !token) {
    if (!missingEnvWarned) {
      console.warn("[presence] Upstash env missing, presence still uses DB for online; Redis optional");
      missingEnvWarned = true;
    }
    return null;
  }
  try {
    redis = Redis.fromEnv();
    return redis;
  } catch (err) {
    console.error("[presence] failed to init Upstash Redis client", err);
    redis = null;
    return null;
  }
}

async function touchUserSessionsLastSeenByUserId(userId: string): Promise<void> {
  const t = new Date();
  await db
    .update(userSessions)
    .set({ lastSeenAt: t, updatedAt: t })
    .where(eq(userSessions.userId, userId));
}

async function touchGuestSessionsLastSeenByGuestId(guestId: string): Promise<void> {
  await db.execute(sql`
    UPDATE guest_sessions
    SET
      last_seen_at = (CURRENT_TIMESTAMP),
      updated_at = (CURRENT_TIMESTAMP)
    WHERE guest_id = ${guestId}
  `);
}

export async function markUserActive(userId: string): Promise<void> {
  if (!userId) return;
  const now = Date.now();
  const isGuestKey = userId.startsWith("g:");

  if (isGuestKey) {
    const gid = userId.slice(2);
    if (gid) {
      void touchGuestSessionsLastSeenByGuestId(gid).catch((err) => {
        console.error("[presence] touch guest_sessions last_seen failed", err);
      });
    }
  } else {
    void touchUserSessionsLastSeenByUserId(userId).catch((err) => {
      console.error("[presence] touch user_sessions last_seen failed", err);
    });
  }

  const client = getRedis();
  if (!client) return;

  const dateKey = getUtcDateKey();
  const dailySetKey = dailyActiveSetKey(dateKey);
  try {
    await client
      .multi()
      .zadd(ACTIVE_USERS_KEY, { score: now, member: userId })
      .sadd(dailySetKey, userId)
      .expire(dailySetKey, DAILY_ACTIVE_SET_TTL_SECONDS)
      .exec();
  } catch (err) {
    console.error("[presence] zadd active_users failed", err);
  }
}

export async function linkGuestToUser(guestId: string, userId: string): Promise<void> {
  if (!guestId || !userId) return;
  const client = getRedis();
  if (!client) return;

  const guestMember = guestId.startsWith("guest_") ? guestId : `guest_${guestId}`;
  const guestPresenceKey = `g:${guestId}`;

  try {
    const [guestScore, userScore, gTaggedScore] = await Promise.all([
      client.zscore(ACTIVE_USERS_KEY, guestMember),
      client.zscore(ACTIVE_USERS_KEY, userId),
      client.zscore(ACTIVE_USERS_KEY, guestPresenceKey),
    ]);

    const now = Date.now();
    const scores = [guestScore, userScore, gTaggedScore].filter(
      (s): s is number => typeof s === "number"
    );
    const effectiveScore = scores.length > 0 ? Math.max(...scores) : now;

    const tx = client.multi();
    tx.zrem(ACTIVE_USERS_KEY, guestMember);
    tx.zrem(ACTIVE_USERS_KEY, guestPresenceKey);
    tx.zadd(ACTIVE_USERS_KEY, { score: effectiveScore, member: userId });
    const todayKey = getUtcDateKey();
    const dailySetKey = dailyActiveSetKey(todayKey);
    tx.srem(dailySetKey, guestMember);
    tx.srem(dailySetKey, guestPresenceKey);
    tx.sadd(dailySetKey, userId);
    tx.expire(dailySetKey, DAILY_ACTIVE_SET_TTL_SECONDS);
    await tx.exec();
  } catch (err) {
    console.error("[presence] linkGuestToUser failed", err);
  }
}

/**
 * @returns `null` = Redis 不可用或读失败，合并时仅走 DB，不算 flaky
 * @returns `[]` = 连接正常但无在线成员
 */
async function readRedisWindowMemberIds(cutoff: number): Promise<string[] | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    await client.zremrangebyscore(ACTIVE_USERS_KEY, 0, cutoff);
  } catch (err) {
    console.error("[presence] zremrangebyscore active_users failed", err);
    return null;
  }
  try {
    return (
      (await client.zrange<string[]>(ACTIVE_USERS_KEY, cutoff, "+inf", {
        byScore: true,
      })) ?? []
    );
  } catch (err) {
    console.error("[presence] zrange active_users failed", err);
    return null;
  }
}

export type OnlinePresenceReport = {
  ids: string[];
  count: number;
  onlineUsersRegistered: number;
  onlineGuestSessionCount: number;
  activeUserSessionsCount: number;
  mergedBreakdown: MergedOnlineBreakdown;
};

async function loadDbOnlineActorKeysAndSessionCounts(): Promise<{
  dbUserIds: string[];
  dbGuestKeys: string[];
  activeUserSessionsCount: number;
  onlineGuestSessionCount: number;
}> {
  const sec = ONLINE_WINDOW_SECONDS;
  const [userQ, guestQ, countQ] = await Promise.all([
    db.execute(sql`
      SELECT user_id::text AS "userId" FROM user_sessions
      WHERE user_id IS NOT NULL
        AND last_seen_at >= (NOW() - (${sec}::int * interval '1 second'))
      GROUP BY user_id
    `),
    db.execute(sql`
      SELECT guest_id::text AS "guestId" FROM guest_sessions
      WHERE last_seen_at >= (NOW() - (${sec}::int * interval '1 second'))
      GROUP BY guest_id
    `),
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int
         FROM user_sessions
         WHERE last_seen_at >= (NOW() - (${sec}::int * interval '1 second'))
        ) AS "activeUserSessions",
        (SELECT COUNT(*)::int
         FROM guest_sessions
         WHERE last_seen_at >= (NOW() - (${sec}::int * interval '1 second'))
        ) AS "activeGuestSessions"
    `),
  ]);
  const userRows = rowsOf(userQ);
  const gRows = rowsOf(guestQ);
  const countRow = rowsOf(countQ)[0] ?? {};

  const dbUserIds = userRows.map((r) => String(r.userId ?? "")).filter(Boolean);
  const dbGuestKeys = gRows
    .map((r) => (r.guestId ? `g:${String(r.guestId)}` : ""))
    .filter(Boolean);

  return {
    dbUserIds,
    dbGuestKeys,
    activeUserSessionsCount: Number(countRow.activeUserSessions ?? 0),
    onlineGuestSessionCount: Number(countRow.activeGuestSessions ?? 0),
  };
}

let lastFlakyMinute: number | null = null;

function maybeEmitPresenceFlaky(dbOnly: number): void {
  if (dbOnly <= 0) return;
  const m = Math.floor(Date.now() / 60_000);
  if (lastFlakyMinute === m) return;
  lastFlakyMinute = m;
  const eventTime = new Date();
  const idk = `presence_flaky:minute_${m}`;
  void insertAnalyticsEventIdempotent({
    eventId: `presence_flaky_${randomUUID()}`,
    idempotencyKey: idk,
    userId: null,
    sessionId: "system",
    eventName: "presence_flaky",
    eventTime,
    page: "presence",
    source: "merge_online",
    platform: "unknown",
    tokenCost: 0,
    playDurationDeltaSec: 0,
    onlineDurationDeltaSec: 0,
    payload: { dbOnlyCount: dbOnly, onlineWindowSec: ONLINE_WINDOW_SECONDS },
  });
}

/**
 * Merged online actors (Redis window + `user_sessions` / `guest_sessions`), plus session counts
 * for admin realtime. Emits `presence_flaky` when Redis is up but some actors only appear in DB.
 */
export async function getOnlinePresenceReport(): Promise<OnlinePresenceReport> {
  const now = Date.now();
  const cutoff = now - ONLINE_WINDOW_MS;
  const [redisIds, dbLoad] = await Promise.all([
    readRedisWindowMemberIds(cutoff),
    loadDbOnlineActorKeysAndSessionCounts(),
  ]);
  const { dbUserIds, dbGuestKeys, activeUserSessionsCount, onlineGuestSessionCount } = dbLoad;
  const mergedBreakdown = mergeOnlineActorKeys(redisIds, dbUserIds, dbGuestKeys);
  const { merged, dbOnly, redisDown } = mergedBreakdown;

  if (!redisDown && dbOnly > 0) {
    maybeEmitPresenceFlaky(dbOnly);
  }

  const onlineUsersRegistered = merged.filter((id) => !id.startsWith("g:")).length;
  return {
    ids: merged,
    count: merged.length,
    onlineUsersRegistered,
    onlineGuestSessionCount,
    activeUserSessionsCount,
    mergedBreakdown,
  };
}

export async function getOnlineUsersFromPresence(): Promise<{
  ids: string[];
  count: number;
}> {
  const r = await getOnlinePresenceReport();
  return { ids: r.ids, count: r.count };
}
