// src/lib/ai/debug/observabilityRing.ts
import { createHash } from "node:crypto";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { TaskType } from "@/lib/ai/types/core";
import { getAppRedisClient } from "@/lib/ratelimit";

const MAX = 120;
const buffer: AiObservabilityRecord[] = [];

/**
 * T7（观测性持久化升级）：这个 ring 此前是纯内存实现——单进程重启即丢失，
 * 且 Next standalone 部署下每个 worker 进程各自持有独立副本（admin 面板只能看到
 * "恰好处理了这次 admin 请求的那个进程"最近发生的事，其余进程的活动完全不可见）。
 *
 * 方案：不新增依赖，复用项目已有的 Redis 客户端（`@/lib/ratelimit` 的
 * `getAppRedisClient`，已在限流/聊天队列/世界引擎队列广泛使用）做"尽力而为"的镜像：
 *  - 写入路径：内存 push 保持同步、不等待、不可能抛错（热路径，每回合多次调用）；
 *    额外 fire-and-forget 一次 Redis LPUSH+LTRIM，失败静默吞掉。
 *  - 读取路径：优先读 Redis（跨进程共享的最新视图），不可用/为空时降级回本进程内存 ring。
 * 这是本仓库第一次使用 Redis List 原语（此前都是 GET/SET/EXPIRE）；选 LPUSH/LTRIM 而非
 * "整体 JSON 序列化后单 key SET"，是因为前者每次 push 是原子操作，不会在并发写入下互相覆盖丢数据。
 */
const REDIS_RING_KEY = "vc:obs:ai_ring:v1";
/** 只是防止 key 在 Redis 里无限期常驻（例如项目下线后忘记清理），不是"数据保留期"承诺。 */
const REDIS_RING_TTL_SECONDS = 7 * 24 * 3600;

async function mirrorPushToRedis(row: AiObservabilityRecord): Promise<void> {
  try {
    const redis = await getAppRedisClient();
    if (!redis) return;
    await redis.lPush(REDIS_RING_KEY, JSON.stringify(row));
    await redis.lTrim(REDIS_RING_KEY, 0, MAX - 1);
    await redis.expire(REDIS_RING_KEY, REDIS_RING_TTL_SECONDS);
  } catch {
    // 尽力而为：观测性镜像失败不应影响主链路，也不应抛出未处理的 rejection。
  }
}

/** Stable observability log envelope type for log drains. */
export const AI_OBSERVABILITY_LOG_TYPE = "ai.observability" as const;

export interface AiObservabilityRecord {
  requestId: string;
  task: TaskType;
  logicalRole?: AiLogicalRole;
  gatewayModel?: string;
  providerId?: string;
  phase: string;
  latencyMs?: number;
  totalTokens?: number;
  stream?: boolean;
  cacheHit?: boolean;
  fallbackCount?: number;
  estCostUsd?: number;
  userIdHash?: string;
  message?: string;
  ttftMs?: number;
  stableCharLen?: number;
  dynamicCharLen?: number;
  cachedPromptTokens?: number;
  finishReason?: string | null;
  finishReasonLength?: boolean;
  retryCount?: number;
  failureScope?: "online" | "offline";
  jsonSanitized?: boolean;
  retrievalLatencyMs?: number;
  retrievalCacheHit?: boolean;
  retrievalSourceCounts?: Record<string, number>;
  retrievalScopeCounts?: Record<string, number>;
  lorePacketChars?: number;
  lorePacketTokenEstimate?: number;
  runtimePacketChars?: number;
  runtimePacketTokenEstimate?: number;
  fallbackRegistryUsed?: boolean;
  factIngestionCount?: number;
  factConflictCount?: number;
  privateFactHitCount?: number;
  bodyBuildMs?: number;
  providerInitMs?: number;
}

function hashUser(userId: string | null | undefined): string | undefined {
  if (!userId) return undefined;
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

export function pushAiObservability(rec: AiObservabilityRecord & { userId?: string | null }): void {
  const { userId, ...rest } = rec;
  const row: AiObservabilityRecord = {
    ...rest,
    userIdHash: hashUser(userId),
  };
  buffer.unshift({ ...row });
  if (buffer.length > MAX) buffer.length = MAX;
  console.info(
    JSON.stringify({
      type: AI_OBSERVABILITY_LOG_TYPE,
      ts: new Date().toISOString(),
      ...row,
    })
  );
  // fire-and-forget：不 await，不阻塞调用方（调用方在 /api/chat 等热路径上）。
  void mirrorPushToRedis(row);
}

/**
 * 读取最近的 AI 可观测性记录。优先返回 Redis 镜像（跨进程共享、重启后仍可读）；
 * Redis 不可用或镜像为空（例如未配置 REDIS_URL）时，降级为当前进程的内存 ring。
 */
export async function listRecentAiObservability(): Promise<AiObservabilityRecord[]> {
  try {
    const redis = await getAppRedisClient();
    if (redis) {
      const rows = await redis.lRange(REDIS_RING_KEY, 0, MAX - 1);
      const parsed = (Array.isArray(rows) ? rows : [])
        .map((raw) => {
          try {
            return JSON.parse(raw) as AiObservabilityRecord;
          } catch {
            return null;
          }
        })
        .filter((x): x is AiObservabilityRecord => x !== null);
      if (parsed.length > 0) return parsed;
    }
  } catch {
    // 降级到内存 ring。
  }
  return buffer.map((r) => ({ ...r }));
}
