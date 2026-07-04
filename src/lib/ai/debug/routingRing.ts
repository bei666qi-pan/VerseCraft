// src/lib/ai/debug/routingRing.ts
import "server-only";

import type { AiRoutingReport } from "@/lib/ai/routing/types";
import { getAppRedisClient } from "@/lib/ratelimit";

const MAX = 80;
const buffer: AiRoutingReport[] = [];

/** Stable routing log envelope type for log drains. */
export const AI_ROUTING_LOG_TYPE = "ai.routing" as const;

/**
 * T7（观测性持久化升级）：与 observabilityRing.ts 同一套"尽力而为 Redis 镜像"方案，
 * 解决同一个问题（单进程内存 ring 重启丢失 + 多 worker 进程互不可见）。见该文件顶部注释。
 */
const REDIS_RING_KEY = "vc:obs:ai_routing_ring:v1";
const REDIS_RING_TTL_SECONDS = 7 * 24 * 3600;

async function mirrorPushToRedis(report: AiRoutingReport): Promise<void> {
  try {
    const redis = await getAppRedisClient();
    if (!redis) return;
    await redis.lPush(REDIS_RING_KEY, JSON.stringify(report));
    await redis.lTrim(REDIS_RING_KEY, 0, MAX - 1);
    await redis.expire(REDIS_RING_KEY, REDIS_RING_TTL_SECONDS);
  } catch {
    // 尽力而为：镜像失败不应影响主链路。
  }
}

export function pushAiRoutingReport(report: AiRoutingReport): void {
  const row = { ...report, attempts: [...report.attempts] };
  buffer.unshift(row);
  if (buffer.length > MAX) buffer.length = MAX;
  console.info(
    JSON.stringify({
      type: AI_ROUTING_LOG_TYPE,
      ts: new Date().toISOString(),
      ...report,
      attempts: report.attempts,
    })
  );
  void mirrorPushToRedis(row);
}

/**
 * 读取最近的 AI 路由报告。优先返回 Redis 镜像（跨进程共享、重启后仍可读）；
 * Redis 不可用或镜像为空时降级为当前进程的内存 ring。
 */
export async function listRecentAiRoutingReports(): Promise<AiRoutingReport[]> {
  try {
    const redis = await getAppRedisClient();
    if (redis) {
      const rows = await redis.lRange(REDIS_RING_KEY, 0, MAX - 1);
      const parsed = (Array.isArray(rows) ? rows : [])
        .map((raw) => {
          try {
            return JSON.parse(raw) as AiRoutingReport;
          } catch {
            return null;
          }
        })
        .filter((x): x is AiRoutingReport => x !== null);
      if (parsed.length > 0) return parsed;
    }
  } catch {
    // 降级到内存 ring。
  }
  return buffer.map((r) => ({ ...r, attempts: [...r.attempts] }));
}
