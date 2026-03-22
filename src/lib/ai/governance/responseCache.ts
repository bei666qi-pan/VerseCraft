import { createHash } from "node:crypto";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import { aiGovernanceEnv } from "@/lib/ai/governance/governanceEnvCore";
import type { AiProviderId } from "@/lib/ai/types/core";
import type { TaskType } from "@/lib/ai/types/core";
import type { ChatMessage } from "@/lib/ai/types/core";
import type { TokenUsage } from "@/lib/ai/types/core";
import { getAppRedisClient } from "@/lib/ratelimit";

const CACHEABLE_TASKS: Partial<Record<TaskType, number>> = {
  DEV_ASSIST: 240,
  WORLDBUILD_OFFLINE: 3600,
  STORYLINE_SIMULATION: 900,
};

const mem = new Map<string, { exp: number; val: string }>();
const MEM_CAP = 400;

function fingerprintMessages(messages: ChatMessage[]): string {
  const body = messages.map((m) => `${m.role}:${(m.content ?? "").slice(0, 16_000)}`).join("\n");
  return createHash("sha256").update(body).digest("hex");
}

function cacheKey(task: TaskType, messages: ChatMessage[]): string {
  return `vc:ai:${aiGovernanceEnv.cacheContentVersion}:${task}:${fingerprintMessages(messages)}`;
}

export function isCompletionTaskCacheable(task: TaskType): boolean {
  return CACHEABLE_TASKS[task] != null;
}

export function completionCacheTtlSec(task: TaskType): number {
  return CACHEABLE_TASKS[task] ?? 0;
}

export interface CachedCompletionPayload {
  content: string;
  logicalRole: AiLogicalRole;
  gatewayModel: string;
  providerId: AiProviderId;
  usage: TokenUsage | null;
}

function memPrune() {
  const now = Date.now();
  for (const [k, v] of mem) {
    if (v.exp <= now) mem.delete(k);
  }
  if (mem.size <= MEM_CAP) return;
  const keys = [...mem.keys()].slice(0, Math.max(0, mem.size - MEM_CAP));
  for (const k of keys) mem.delete(k);
}

export async function readCompletionCache(
  task: TaskType,
  messages: ChatMessage[]
): Promise<CachedCompletionPayload | null> {
  if (!aiGovernanceEnv.responseCacheEnabled || !isCompletionTaskCacheable(task)) return null;
  const key = cacheKey(task, messages);

  const redis = await getAppRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as CachedCompletionPayload;
    } catch {
      return null;
    }
  }

  memPrune();
  const row = mem.get(key);
  if (!row || row.exp <= Date.now()) return null;
  try {
    return JSON.parse(row.val) as CachedCompletionPayload;
  } catch {
    return null;
  }
}

export async function writeCompletionCache(
  task: TaskType,
  messages: ChatMessage[],
  payload: CachedCompletionPayload,
  ttlSec: number
): Promise<void> {
  if (!aiGovernanceEnv.responseCacheEnabled || !isCompletionTaskCacheable(task)) return;
  const key = cacheKey(task, messages);
  const val = JSON.stringify(payload);

  const redis = await getAppRedisClient();
  if (redis) {
    try {
      await redis.set(key, val, { EX: ttlSec });
    } catch {
      // fall through to memory
    }
    return;
  }

  mem.set(key, { val, exp: Date.now() + ttlSec * 1000 });
  memPrune();
}
