// src/lib/presence.ts
import "server-only";

import { Redis } from "@upstash/redis";

const ACTIVE_USERS_KEY = "active_users";
const ONLINE_WINDOW_MS = 10 * 60_000; // 10 min for better visibility

let redis: ReturnType<typeof Redis.fromEnv> | null = null;

function getRedis(): ReturnType<typeof Redis.fromEnv> | null {
  if (redis) return redis;
  try {
    redis = Redis.fromEnv();
    return redis;
  } catch (err) {
    console.error("[presence] failed to init Upstash Redis client", err);
    redis = null;
    return null;
  }
}

export async function markUserActive(userId: string): Promise<void> {
  if (!userId) return;
  const client = getRedis();
  if (!client) return;

  const now = Date.now();
  try {
    await client.zadd(ACTIVE_USERS_KEY, {
      score: now,
      member: userId,
    });
  } catch (err) {
    console.error("[presence] zadd active_users failed", err);
  }
}

export async function linkGuestToUser(guestId: string, userId: string): Promise<void> {
  if (!guestId || !userId) return;
  const client = getRedis();
  if (!client) return;

  const guestMember = guestId.startsWith("guest_") ? guestId : `guest_${guestId}`;

  try {
    const [guestScore, userScore] = await Promise.all([
      client.zscore<number | null>(ACTIVE_USERS_KEY, guestMember as any),
      client.zscore<number | null>(ACTIVE_USERS_KEY, userId as any),
    ]);

    const now = Date.now();
    const effectiveScore =
      typeof guestScore === "number" && typeof userScore === "number"
        ? Math.max(guestScore, userScore)
        : typeof guestScore === "number"
          ? guestScore
          : typeof userScore === "number"
            ? userScore
            : now;

    const tx = client.multi();
    tx.zrem(ACTIVE_USERS_KEY, guestMember);
    tx.zadd(ACTIVE_USERS_KEY, {
      score: effectiveScore,
      member: userId,
    });
    await tx.exec();
  } catch (err) {
    console.error("[presence] linkGuestToUser failed", err);
  }
}

export async function getOnlineUsersFromPresence(): Promise<{
  ids: string[];
  count: number;
}> {
  const client = getRedis();
  if (!client) {
    return { ids: [], count: 0 };
  }

  const now = Date.now();
  const cutoff = now - ONLINE_WINDOW_MS;

  try {
    await client.zremrangebyscore(ACTIVE_USERS_KEY, 0, cutoff);
  } catch (err) {
    console.error("[presence] zremrangebyscore active_users failed", err);
  }

  try {
    const ids =
      (await client.zrange<string[]>(ACTIVE_USERS_KEY, cutoff, "+inf", {
        byScore: true,
      })) ?? [];
    return { ids, count: ids.length };
  } catch (err) {
    console.error("[presence] zrange active_users failed", err);
    return { ids: [], count: 0 };
  }
}

