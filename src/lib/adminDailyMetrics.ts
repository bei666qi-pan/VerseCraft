import "server-only";

import { Redis } from "@upstash/redis";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminMetricsDaily, adminStatsSnapshots, users } from "@/db/schema";

export type AdminChartPoint = {
  date: string;
  users: number; // reserved for future use; client currently doesn't render this value
  tokens: number; // cumulative tokens for the chart (within our selected range)
  activeUsers: number; // DAU for the date
  dailyTokens?: number; // per-day tokens for bar chart (if provided)
};

const ACTIVE_USERS_SET_PREFIX = "admin_daily_active_users:"; // per-UTC-date set of unique members
const DAILY_TOKENS_HASH = "admin_daily_tokens_total"; // hash field: dateKey -> tokens (sum)
const DAILY_PLAYTIME_HASH = "admin_daily_playtime_total"; // hash field: dateKey -> playTime seconds (sum)
export const DAILY_ACTIVE_SET_TTL_SECONDS = 3 * 24 * 60 * 60; // keep a few days for charting; avoid unbounded growth

const DAILY_METRICS_LOOKBACK_DEFAULT = 14;

let redis: ReturnType<typeof Redis.fromEnv> | null = null;
let missingEnvWarned = false;

function getRedis(): ReturnType<typeof Redis.fromEnv> | null {
  if (redis) return redis;
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  if (!url || !token) {
    if (!missingEnvWarned) {
      console.warn("[adminDailyMetrics] Upstash env missing, redis metrics fallback disabled");
      missingEnvWarned = true;
    }
    return null;
  }
  try {
    redis = Redis.fromEnv();
    return redis;
  } catch (err) {
    console.error("[adminDailyMetrics] failed to init Upstash Redis client", err);
    redis = null;
    return null;
  }
}

export function getUtcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(date: Date, deltaDays: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}

export function dailyActiveSetKey(dateKey: string): string {
  return `${ACTIVE_USERS_SET_PREFIX}${dateKey}`;
}

export async function recordDailyActiveUser(userIdOrGuestMember: string, dateKey: string = getUtcDateKey()): Promise<void> {
  if (!userIdOrGuestMember) return;
  const client = getRedis();
  if (!client) return;
  const setKey = dailyActiveSetKey(dateKey);
  try {
    await client.multi().sadd(setKey, userIdOrGuestMember).expire(setKey, DAILY_ACTIVE_SET_TTL_SECONDS).exec();
  } catch (err) {
    console.error("[adminDailyMetrics] recordDailyActiveUser failed", err);
  }
}

export async function recordDailyTokenUsage(dateKey: string, tokenDelta: number, playTimeDeltaSec: number): Promise<void> {
  const tokenVal = Number.isFinite(tokenDelta) ? tokenDelta : 0;
  const playVal = Number.isFinite(playTimeDeltaSec) ? playTimeDeltaSec : 0;
  if (tokenVal <= 0 && playVal <= 0) return;

  const client = getRedis();
  if (!client) return;

  try {
    await client
      .multi()
      .hincrby(DAILY_TOKENS_HASH, dateKey, Math.trunc(tokenVal))
      .hincrby(DAILY_PLAYTIME_HASH, dateKey, Math.trunc(playVal))
      .exec();
  } catch (err) {
    // Best-effort telemetry: never break gameplay/admin flows.
    console.error("[adminDailyMetrics] recordDailyTokenUsage failed", err);
  }
}

async function getDailyTokensAndActiveUsersFromRedis(dateKeys: string[]): Promise<{
  dailyTokensByDate: Record<string, number>;
  dailyActiveUsersByDate: Record<string, number>;
} | null> {
  const client = getRedis();
  if (!client) return null;
  if (dateKeys.length === 0) return { dailyTokensByDate: {}, dailyActiveUsersByDate: {} };

  try {
    const tx = client.multi();
    for (const dk of dateKeys) {
      // tokens hash + unique active set count
      tx.hget(DAILY_TOKENS_HASH, dk);
      tx.scard(dailyActiveSetKey(dk));
    }
    const results = await tx.exec();

    const dailyTokensByDate: Record<string, number> = {};
    const dailyActiveUsersByDate: Record<string, number> = {};
    for (let i = 0; i < dateKeys.length; i++) {
      const tokenRaw = results?.[i * 2];
      const activeRaw = results?.[i * 2 + 1];
      dailyTokensByDate[dateKeys[i]!] = Number(tokenRaw ?? 0) || 0;
      dailyActiveUsersByDate[dateKeys[i]!] = Number(activeRaw ?? 0) || 0;
    }

    return { dailyTokensByDate, dailyActiveUsersByDate };
  } catch (err) {
    console.error("[adminDailyMetrics] getDailyTokensAndActiveUsersFromRedis failed", err);
    return null;
  }
}

export async function getAdminChartData(daysBack: number = DAILY_METRICS_LOOKBACK_DEFAULT, endDate: Date = new Date()): Promise<AdminChartPoint[]> {
  const safeDaysBack = Math.max(1, Math.min(60, Math.trunc(daysBack)));

  const endKey = getUtcDateKey(endDate);
  const startDate = addDaysUtc(endDate, -(safeDaysBack - 1));
  const startKey = getUtcDateKey(startDate);

  const dateKeys: string[] = [];
  for (let i = 0; i < safeDaysBack; i++) {
    const dk = getUtcDateKey(addDaysUtc(startDate, i));
    dateKeys.push(dk);
  }

  // 0) Prefer event-driven daily aggregates (new foundation).
  // Fallback to legacy snapshot/redis logic if analytics tables aren't ready yet.
  try {
    const dailyRows = await db
      .select({
        dateKey: adminMetricsDaily.dateKey,
        dau: adminMetricsDaily.dau,
        tokenTotal: adminMetricsDaily.totalTokenCost,
      })
      .from(adminMetricsDaily)
      .where(sql`${adminMetricsDaily.dateKey} >= ${startKey} AND ${adminMetricsDaily.dateKey} <= ${endKey}`)
      .orderBy(asc(adminMetricsDaily.dateKey));

    if (dailyRows.length === 0) {
      throw new Error("admin_metrics_daily empty for range");
    }

    const dailyByDate: Record<string, { dau: number; tokenTotal: number }> = {};
    for (const row of dailyRows) {
      const dk = String(row.dateKey);
      dailyByDate[dk] = {
        dau: Number(row.dau ?? 0),
        tokenTotal: Number(row.tokenTotal ?? 0),
      };
    }

    // Align cumulative "tokens" line with current DB total for compatibility.
    const [agg] = await db
      .select({ totalTokens: sql<number>`COALESCE(SUM(${users.tokensUsed}), 0)` })
      .from(users);
    const liveTotalTokens = Number(agg?.totalTokens ?? 0);

    let running = 0;
    const rawPoints: AdminChartPoint[] = [];
    for (let i = 0; i < dateKeys.length; i++) {
      const dk = dateKeys[i]!;
      const d = dailyByDate[dk];
      const dailyTokens = d ? Math.max(0, d.tokenTotal) : 0;
      const activeUsers = d ? Math.max(0, d.dau) : 0;
      running += dailyTokens;
      rawPoints.push({
        date: dk,
        users: 0,
        tokens: running,
        activeUsers,
        dailyTokens,
      });
    }

    const endTokens = rawPoints.length > 0 ? rawPoints[rawPoints.length - 1]!.tokens : 0;
    const offset = Math.max(0, liveTotalTokens - endTokens);

    // Apply constant offset so the last point matches the DB lifetime total.
    const chartData = rawPoints.map((p, idx) => ({
      ...p,
      tokens: idx === rawPoints.length - 1 ? p.tokens + offset : p.tokens,
    }));

    return chartData;
  } catch (err) {
    // analytics tables might not exist yet; keep legacy fallback below.
    console.warn("[adminDailyMetrics] admin_metrics_daily unavailable, fallback to legacy metrics", err);
  }

  // 1) Snapshot fallback (historical, stable once written). No writes here.
  let snapshotsByDate: Record<
    string,
    {
      totalTokens: number;
      activeUsers: number;
    }
  > = {};

  try {
    const snaps = await db
      .select({
        date: adminStatsSnapshots.date,
        totalTokens: adminStatsSnapshots.totalTokens,
        activeUsers: adminStatsSnapshots.activeUsers,
      })
      .from(adminStatsSnapshots)
      .where(sql`${adminStatsSnapshots.date} >= ${startKey} AND ${adminStatsSnapshots.date} <= ${endKey}`)
      .orderBy(asc(adminStatsSnapshots.date));

    for (const s of snaps) {
      const dk = String(s.date);
      snapshotsByDate[dk] = {
        totalTokens: Number(s.totalTokens ?? 0),
        activeUsers: Number(s.activeUsers ?? 0),
      };
    }
  } catch (err) {
    // Missing table / migration edge case: keep redis-only mode.
    console.warn("[adminDailyMetrics] snapshot query failed, falling back to live redis metrics", err);
    snapshotsByDate = {};
  }

  // 2) Live daily metrics from Redis (today + after deployment)
  const redisDaily = await getDailyTokensAndActiveUsersFromRedis(dateKeys);

  const dailyTokensByDate = redisDaily?.dailyTokensByDate ?? {};
  const dailyActiveUsersByDate = redisDaily?.dailyActiveUsersByDate ?? {};

  // 3) Live totals for today (so the cumulative line ends at the current DB total)
  // Note: We still keep history from snapshots; stage1 only improves "today" accuracy.
  let liveTotalTokens = 0;
  try {
    const [agg] = await db
      .select({ totalTokens: sql<number>`COALESCE(SUM(${users.tokensUsed}), 0)` })
      .from(users);
    liveTotalTokens = Number(agg?.totalTokens ?? 0);
  } catch {
    liveTotalTokens = snapshotsByDate[endKey]?.totalTokens ?? 0;
  }

  // 4) Build chart points (cumulative tokens + per-day dailyTokens + active users)
  let prevResolvedTokens = 0;
  const chartData: AdminChartPoint[] = [];

  // DAU today: prefer redis set; fallback to DB lastActive
  let fallbackDaUFromDbToday = 0;
  try {
    const [dauRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(sql`DATE(${users.lastActive}) = ${endKey}`);
    fallbackDaUFromDbToday = Number(dauRow?.count ?? 0);
  } catch {
    fallbackDaUFromDbToday = 0;
  }

  for (let i = 0; i < dateKeys.length; i++) {
    const dk = dateKeys[i]!;
    const snapshot = snapshotsByDate[dk];
    const redisDailyTokens = dailyTokensByDate[dk];
    const redisDailyActive = dailyActiveUsersByDate[dk];

    const tokensFromSnapshot = snapshot ? Number(snapshot.totalTokens ?? 0) : null;
    const activeFromSnapshot = snapshot ? Number(snapshot.activeUsers ?? 0) : null;
    const isToday = dk === endKey;

    let dailyTokens = 0;
    let tokensCumulative = 0;
    let activeUsers = 0;

    if (tokensFromSnapshot != null && !isToday) {
      // Historical days: prefer snapshot cumulative and derive daily delta by stable snapshot diff.
      tokensCumulative = tokensFromSnapshot;
      dailyTokens = i === 0 ? Math.max(0, tokensFromSnapshot) : Math.max(0, tokensFromSnapshot - prevResolvedTokens);
      activeUsers = activeFromSnapshot ?? 0;
    } else if (isToday) {
      // Today: prefer live Redis for DAU / daily token if present; keep cumulative ending at DB total.
      const deltaFromCumulative = Math.max(0, liveTotalTokens - prevResolvedTokens);
      const redisResolvedTokens = Number.isFinite(redisDailyTokens) ? Math.max(0, redisDailyTokens) : 0;
      // If Redis doesn't have today's field yet, it will look like 0; use cumulative delta as a safe fallback.
      dailyTokens = redisResolvedTokens === 0 && deltaFromCumulative > 0 ? deltaFromCumulative : redisResolvedTokens;
      tokensCumulative = liveTotalTokens;
      const redisResolvedActive = Number.isFinite(redisDailyActive) ? Number(redisDailyActive) : 0;
      // Same idea for DAU: if Redis misses today's set, prefer DB lastActive day count.
      activeUsers = redisResolvedActive === 0 && fallbackDaUFromDbToday > 0 ? fallbackDaUFromDbToday : redisResolvedActive;
    } else {
      // No snapshot for this day: fall back to Redis daily tokens/DAU and build cumulative by running sum.
      dailyTokens = Number.isFinite(redisDailyTokens) ? Math.max(0, redisDailyTokens) : 0;
      tokensCumulative = prevResolvedTokens + dailyTokens;
      activeUsers =
        activeFromSnapshot != null
          ? activeFromSnapshot
          : Number.isFinite(redisDailyActive)
            ? Number(redisDailyActive)
            : 0;
    }

    chartData.push({
      date: dk,
      users: 0,
      tokens: tokensCumulative,
      activeUsers,
      dailyTokens,
    });

    prevResolvedTokens = tokensCumulative;
  }

  return chartData;
}

