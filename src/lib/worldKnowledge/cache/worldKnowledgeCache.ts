import { getAppRedisClient } from "@/lib/ratelimit";
import { WORLD_KNOWLEDGE_CACHE_VERSION, WORLD_KNOWLEDGE_TTL } from "../constants";
import type { LorePacket, RuntimeLoreRequest } from "../types";

const requestMemo = new Map<string, LorePacket>();
const memFallback = new Map<string, { exp: number; value: string }>();
const MEM_FALLBACK_STALE_GRACE_MS = 30_000;

function scopedTtlSec(input: RuntimeLoreRequest, hasConflict: boolean): number {
  if (hasConflict) return WORLD_KNOWLEDGE_TTL.riskShortSec;
  if (input.worldScope.includes("session")) return WORLD_KNOWLEDGE_TTL.sessionSec;
  if (input.worldScope.includes("user")) return WORLD_KNOWLEDGE_TTL.userSec;
  if (input.worldScope.includes("core")) return WORLD_KNOWLEDGE_TTL.coreSec;
  return WORLD_KNOWLEDGE_TTL.sharedSec;
}

function buildCacheKey(input: RuntimeLoreRequest, queryFingerprint: string, entitiesHash: string): string {
  return [
    "vc:wk",
    WORLD_KNOWLEDGE_CACHE_VERSION,
    "packet",
    input.taskType,
    `wr${(input.worldRevision ?? BigInt(0)).toString()}`,
    input.worldScope.join(","),
    input.userId ?? "anon",
    input.sessionId ?? "anon",
    queryFingerprint,
    (input.playerLocation ?? "unknown").toLowerCase(),
    entitiesHash,
  ].join(":");
}

function isHighRiskPacket(packet: LorePacket): boolean {
  if (packet.debugMeta.trimmedByBudget) return false;
  return packet.retrievedFacts.some((f) => {
    const text = f.canonicalText.toLowerCase();
    return text.includes("冲突") || text.includes("矛盾") || text.includes("待确认");
  });
}

export function readRequestMemo(key: string): LorePacket | null {
  return requestMemo.get(key) ?? null;
}

export function writeRequestMemo(key: string, packet: LorePacket): void {
  requestMemo.set(key, packet);
}

export async function readWorldLoreCache(args: {
  input: RuntimeLoreRequest;
  queryFingerprint: string;
  entitiesHash: string;
}): Promise<{ key: string; packet: LorePacket | null; redisHit: boolean; level0Hit: boolean }> {
  const key = buildCacheKey(args.input, args.queryFingerprint, args.entitiesHash);
  const level0 = readRequestMemo(key);
  if (level0) return { key, packet: level0, redisHit: false, level0Hit: true };

  const redis = await getAppRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) {
        const parsed = JSON.parse(raw) as LorePacket;
        writeRequestMemo(key, parsed);
        return { key, packet: parsed, redisHit: true, level0Hit: false };
      }
    } catch {
      // ignore
    }
  }

  const fallback = memFallback.get(key);
  if (fallback && fallback.exp + MEM_FALLBACK_STALE_GRACE_MS > Date.now()) {
    try {
      const parsed = JSON.parse(fallback.value) as LorePacket;
      writeRequestMemo(key, parsed);
      return { key, packet: parsed, redisHit: false, level0Hit: false };
    } catch {
      // ignore
    }
  }

  return { key, packet: null, redisHit: false, level0Hit: false };
}

export async function writeWorldLoreCache(args: {
  key: string;
  input: RuntimeLoreRequest;
  packet: LorePacket;
}): Promise<{ wroteRedis: boolean; ttlSec: number }> {
  const highRisk = isHighRiskPacket(args.packet);
  const ttlSec = scopedTtlSec(args.input, highRisk);
  const payload = JSON.stringify(args.packet);
  writeRequestMemo(args.key, args.packet);

  const redis = await getAppRedisClient();
  if (redis) {
    try {
      await redis.set(args.key, payload, { EX: ttlSec });
      return { wroteRedis: true, ttlSec };
    } catch {
      // ignore
    }
  }

  memFallback.set(args.key, { exp: Date.now() + ttlSec * 1000, value: payload });
  if (memFallback.size > 500) {
    const k = memFallback.keys().next().value;
    if (k) memFallback.delete(k);
  }
  return { wroteRedis: false, ttlSec };
}

export function buildEntitySnapshotKey(code: string): string {
  return `vc:wk:${WORLD_KNOWLEDGE_CACHE_VERSION}:entity:${code}`;
}
