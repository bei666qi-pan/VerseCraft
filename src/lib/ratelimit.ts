// src/lib/ratelimit.ts
// Local Redis-based rate limiting + hot IP cache.

import { createClient, type RedisClientType } from "redis";
import { envRaw } from "@/lib/config/envRaw";

type CacheEntry = { allowed: boolean; resetAt: number };
const HOT_IP_CACHE_TTL_MS = 2000;

const hotIpCache = new Map<string, CacheEntry>();

function getCached(key: string): { allowed: boolean } | null {
  const entry = hotIpCache.get(key);
  if (!entry || Date.now() >= entry.resetAt) return null;
  return { allowed: entry.allowed };
}

function setCache(key: string, allowed: boolean) {
  hotIpCache.set(key, {
    allowed,
    resetAt: Date.now() + HOT_IP_CACHE_TTL_MS,
  });
}

function createInMemoryLimiter(limit: number, intervalMs: number) {
  const store = new Map<string, { count: number; resetAt: number }>();
  const CLEANUP_INTERVAL = 60000;
  let lastCleanup = Date.now();

  return (ip: string): boolean => {
    const now = Date.now();
    if (now - lastCleanup > CLEANUP_INTERVAL) {
      for (const [key, v] of store) {
        if (v.resetAt < now) store.delete(key);
      }
      lastCleanup = now;
    }

    const cur = store.get(ip);
    if (!cur) {
      store.set(ip, { count: 1, resetAt: now + intervalMs });
      return true;
    }
    if (now >= cur.resetAt) {
      store.set(ip, { count: 1, resetAt: now + intervalMs });
      return true;
    }
    if (cur.count >= limit) return false;
    cur.count++;
    return true;
  };
}

const generalFallback = createInMemoryLimiter(30, 60000);
const llmFallback = createInMemoryLimiter(10, 60000);
const REDIS_RETRY_AFTER_MS = 30000;

let clientPromise: Promise<RedisClientType> | null = null;
let redisUnavailableUrl: string | null = null;
let redisUnavailableUntil = 0;
let redisUnavailableLogKey: string | null = null;

function redisBackoffActive(url: string): boolean {
  if (redisUnavailableUrl !== url) {
    redisUnavailableUrl = null;
    redisUnavailableUntil = 0;
    redisUnavailableLogKey = null;
    return false;
  }
  return Date.now() < redisUnavailableUntil;
}

function errorCode(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("code" in err)) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function markRedisUnavailable(url: string, err: unknown): void {
  redisUnavailableUrl = url;
  redisUnavailableUntil = Date.now() + REDIS_RETRY_AFTER_MS;

  const code = errorCode(err);
  const logKey = code ? `${url}:${code}` : `${url}:unknown`;
  if (redisUnavailableLogKey === logKey) return;

  redisUnavailableLogKey = logKey;
  const detail = code ? `${code}: ${errorMessage(err)}` : errorMessage(err);
  console.warn(`[ratelimit] Redis unavailable; fallback to in-memory limiter (${detail})`);
}

/** Shared Redis connection for rate limits, AI cache, and governance (optional). */
export async function getAppRedisClient(): Promise<RedisClientType | null> {
  const url = envRaw("REDIS_URL");
  if (!url || url.trim().length === 0) return null;
  if (redisBackoffActive(url)) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const client: RedisClientType = createClient({
        url,
        socket: {
          reconnectStrategy: false,
        },
      });
      client.on("error", (err) => {
        markRedisUnavailable(url, err);
      });
      await client.connect();
      return client;
    })();
  }
  try {
    return await clientPromise;
  } catch (err) {
    markRedisUnavailable(url, err);
    clientPromise = null;
    return null;
  }
}

export async function __resetRatelimitForTests(): Promise<void> {
  const pendingClient = clientPromise;
  clientPromise = null;
  redisUnavailableUrl = null;
  redisUnavailableUntil = 0;
  redisUnavailableLogKey = null;
  hotIpCache.clear();

  if (!pendingClient) return;
  const client = await pendingClient.catch(() => null);
  if (client?.isOpen) {
    await client.disconnect();
  }
}

async function checkWithRedis(
  ip: string,
  prefix: string,
  limit: number,
  intervalMs: number
): Promise<boolean | null> {
  const client = await getAppRedisClient();
  if (!client) return null;

  const now = Date.now();
  const windowId = Math.floor(now / intervalMs);
  const key = `${prefix}:${windowId}:${ip}`;

  try {
    const multiResult = (await client
      .multi()
      .incr(key)
      .pExpire(key, intervalMs, "NX")
      .exec()) as unknown as Array<[unknown, unknown]>;

    const incrReply = multiResult?.[0]?.[1];
    const count = typeof incrReply === "number" ? incrReply : Number(incrReply ?? 0);
    const allowed = Number.isFinite(count) ? count <= limit : true;
    setCache(prefix === "g" ? `g:${ip}` : `llm:${ip}`, allowed);
    return allowed;
  } catch (err) {
    console.error("[ratelimit] Redis check failed, fallback to in-memory", err);
    return null;
  }
}

export async function checkGeneralRateLimit(ip: string): Promise<boolean> {
  const cacheKey = `g:${ip}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached.allowed;

  const redisDecision = await checkWithRedis(ip, "g", 30, 60000);
  if (redisDecision !== null) return redisDecision;

  return generalFallback(ip);
}

export async function checkLlmRateLimit(ip: string): Promise<boolean> {
  const cacheKey = `llm:${ip}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached.allowed;

  const redisDecision = await checkWithRedis(ip, "llm", 10, 60000);
  if (redisDecision !== null) return redisDecision;

  return llmFallback(ip);
}
