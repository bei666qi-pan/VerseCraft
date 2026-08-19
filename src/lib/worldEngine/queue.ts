import "server-only";

import { enqueueJob } from "@/lib/kg/jobs";
import { getAppRedisClient } from "@/lib/ratelimit";
import type { WorldEngineTickPayload } from "./contracts";
import { enqueueWorldEngineTickWithDeps } from "./queueCore";
export { enqueueWorldEngineTickWithDeps } from "./queueCore";

export async function enqueueWorldEngineTick(
  payload: Omit<WorldEngineTickPayload, "dedupKey" | "enqueuedAt">
): Promise<{ enqueued: boolean; jobId: number | null; dedupKey: string }> {
  return enqueueWorldEngineTickWithDeps(payload, {
    persistJob: (jobPayload, dedupKey) => enqueueJob("WORLD_ENGINE_TICK", jobPayload, { priority: 4, idempotencyKey: dedupKey }),
    getRedis: getAppRedisClient,
  });
}
