import { createHash } from "node:crypto";
import type { EnqueueJobResult } from "@/lib/kg/jobs";
import type { WorldEngineTickPayload } from "./contracts";

type RedisCache = {
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
};

function buildDedupKey(payload: Omit<WorldEngineTickPayload, "dedupKey" | "enqueuedAt">): string {
  // A committed turn is the idempotency authority. Trigger order, trigger set,
  // request retries and wall-clock buckets must never create a second job.
  const base = JSON.stringify({
    sessionId: payload.sessionId,
    worldId: payload.worldId,
    mapId: payload.mapId,
    turnIndex: payload.turnIndex,
  });
  return `we:${createHash("sha256").update(base).digest("hex").slice(0, 24)}`;
}

export async function enqueueWorldEngineTickWithDeps(
  payload: Omit<WorldEngineTickPayload, "dedupKey" | "enqueuedAt">,
  deps: {
    persistJob: (payload: WorldEngineTickPayload, dedupKey: string) => Promise<EnqueueJobResult>;
    getRedis?: () => Promise<RedisCache | null>;
  },
): Promise<{ enqueued: boolean; jobId: number | null; dedupKey: string }> {
  const dedupKey = buildDedupKey(payload);
  const job = await deps.persistJob({ ...payload, dedupKey, enqueuedAt: new Date().toISOString() }, dedupKey);
  if (!job.persisted || !job.jobId) return { enqueued: false, jobId: null, dedupKey };
  const redis = deps.getRedis ? await deps.getRedis() : null;
  if (redis) void redis.set(`vc:we:dedup:${dedupKey}`, String(job.jobId), { EX: 120 }).catch(() => {});
  return { enqueued: true, jobId: job.jobId, dedupKey };
}
