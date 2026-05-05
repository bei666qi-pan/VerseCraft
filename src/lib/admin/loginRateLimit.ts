import "server-only";

import { createClient } from "redis";
import { env } from "@/lib/env";

const WINDOW_SECONDS = 60;
const BLOCK_SECONDS = 5 * 60;
const MAX_FAILURES_PER_WINDOW = 5;

type RedisClient = ReturnType<typeof createClient>;
type Fingerprint = { ipHash: string | null; userAgentHash: string | null };
type MemoryBucket = { count: number; resetAt: number; blockUntil: number };

const memoryBuckets = new Map<string, MemoryBucket>();
let redisClientPromise: Promise<RedisClient | null> | null = null;

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("admin_login_redis_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function bucketKey(fp: Fingerprint): string {
  return `${fp.ipHash ?? "no_ip"}:${fp.userAgentHash ?? "no_ua"}`;
}

function redisKey(fp: Fingerprint, suffix: string): string {
  return `admin:login:${bucketKey(fp)}:${suffix}`;
}

async function getRedisClient(): Promise<RedisClient | null> {
  const url = env.redisUrl?.trim();
  if (!url) return null;
  if (redisClientPromise) return redisClientPromise;
  redisClientPromise = (async () => {
    try {
      const client = createClient({ url });
      client.on("error", () => {});
      await withDeadline(client.connect(), 800);
      return client;
    } catch {
      return null;
    }
  })();
  return redisClientPromise;
}

function getMemoryBucket(fp: Fingerprint): MemoryBucket {
  const key = bucketKey(fp);
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (existing && existing.resetAt > now) return existing;
  const next = { count: 0, resetAt: now + WINDOW_SECONDS * 1000, blockUntil: existing?.blockUntil ?? 0 };
  memoryBuckets.set(key, next);
  return next;
}

export async function checkAdminLoginRateLimit(fp: Fingerprint): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
  degraded: boolean;
  reason: string | null;
}> {
  const client = await getRedisClient();
  if (client) {
    try {
      const block = await client.get(redisKey(fp, "blocked"));
      if (block) {
        const retryAfterSeconds = Math.max(1, Number(block) - Math.floor(Date.now() / 1000));
        return { allowed: false, retryAfterSeconds, degraded: false, reason: "rate_limited" };
      }
      const countRaw = await client.get(redisKey(fp, "window"));
      const count = Number(countRaw ?? 0);
      if (count >= MAX_FAILURES_PER_WINDOW) {
        return { allowed: false, retryAfterSeconds: BLOCK_SECONDS, degraded: false, reason: "rate_limited" };
      }
      return { allowed: true, retryAfterSeconds: 0, degraded: false, reason: null };
    } catch {
      /* fall back to memory */
    }
  }

  const bucket = getMemoryBucket(fp);
  const now = Date.now();
  if (bucket.blockUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.blockUntil - now) / 1000),
      degraded: true,
      reason: "rate_limited_memory",
    };
  }
  if (bucket.count >= MAX_FAILURES_PER_WINDOW) {
    bucket.blockUntil = now + BLOCK_SECONDS * 1000;
    return { allowed: false, retryAfterSeconds: BLOCK_SECONDS, degraded: true, reason: "rate_limited_memory" };
  }
  return { allowed: true, retryAfterSeconds: 0, degraded: !client, reason: client ? null : "redis_unavailable" };
}

export async function recordAdminLoginFailure(fp: Fingerprint): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    try {
      const key = redisKey(fp, "window");
      const count = await client.incr(key);
      await client.expire(key, WINDOW_SECONDS);
      if (count >= MAX_FAILURES_PER_WINDOW) {
        await client.set(redisKey(fp, "blocked"), String(Math.floor(Date.now() / 1000) + BLOCK_SECONDS), {
          EX: BLOCK_SECONDS,
        });
      }
      return;
    } catch {
      /* fall back to memory */
    }
  }
  const bucket = getMemoryBucket(fp);
  bucket.count += 1;
  if (bucket.count >= MAX_FAILURES_PER_WINDOW) {
    bucket.blockUntil = Date.now() + BLOCK_SECONDS * 1000;
  }
}

export async function recordAdminLoginSuccess(fp: Fingerprint): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    try {
      await client.del([redisKey(fp, "window"), redisKey(fp, "blocked")]);
    } catch {
      /* ignore */
    }
  }
  memoryBuckets.delete(bucketKey(fp));
}

export async function getAdminLoginRateLimitHealth(): Promise<{
  redisConfigured: boolean;
  redisAvailable: boolean;
  fallbackBuckets: number;
}> {
  const redisConfigured = Boolean(env.redisUrl?.trim());
  const client = await getRedisClient();
  let redisAvailable = false;
  if (client) {
    try {
      redisAvailable = (await client.ping()) === "PONG";
    } catch {
      redisAvailable = false;
    }
  }
  return { redisConfigured, redisAvailable, fallbackBuckets: memoryBuckets.size };
}
