// src/lib/presence.ts
import "server-only";

import { Redis } from "@upstash/redis";

const ACTIVE_USERS_KEY = "active_users";
const ONLINE_WINDOW_MS = 5 * 60_000;

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

