import "server-only";

import { createHash } from "node:crypto";
import { enqueueJob } from "@/lib/kg/jobs";
import { getAppRedisClient } from "@/lib/ratelimit";
import type { WorldEngineTickPayload } from "./contracts";

function buildDedupKey(payload: Omit<WorldEngineTickPayload, "dedupKey" | "enqueuedAt">): string {
  const bucket = Math.floor(Date.now() / 120000);
  const base = JSON.stringify({
    sessionId: payload.sessionId,
    triggerSignals: payload.triggerSignals.slice().sort(),
    turnIndex: payload.turnIndex,
    bucket,
  });
  return `we:${createHash("sha256").update(base).digest("hex").slice(0, 24)}`;
}

export async function enqueueWorldEngineTick(
  payload: Omit<WorldEngineTickPayload, "dedupKey" | "enqueuedAt">
): Promise<{ enqueued: boolean; dedupKey: string }> {
  const dedupKey = buildDedupKey(payload);
  const redis = await getAppRedisClient();
  if (redis) {
    try {
      const lock = await redis.set(`vc:we:dedup:${dedupKey}`, "1", { NX: true, EX: 120 });
      if (lock !== "OK") return { enqueued: false, dedupKey };
    } catch {
      // Redis unavailable: fall through to DB enqueue.
    }
  }

  await enqueueJob(
    "WORLD_ENGINE_TICK",
    {
      ...payload,
      dedupKey,
      enqueuedAt: new Date().toISOString(),
    },
    { priority: 4 }
  );
  return { enqueued: true, dedupKey };
}
