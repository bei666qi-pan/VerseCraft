// src/lib/presence/playDurationChain.integration.test.ts
/**
 * In-process “integration” of the same last_seen / computePlayDeltaSec chain used
 * by `applyPresenceHeartbeat` (no DB). Validates ~5m wall time via 10 x 30s steps ≈ 300s credited.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { computePlayDeltaSec } from "@/lib/presence/heartbeatCore";

test("5 minutes, 10 heartbeats at 30s: cumulative play delta is 300s (±0)", () => {
  const start = new Date("2024-06-15T10:00:00.000Z");
  const intervalsSec = 30;
  const beats = 10;
  let lastSeen: Date = start;
  let total = 0;
  for (let n = 1; n <= beats; n += 1) {
    const now = new Date(start.getTime() + n * intervalsSec * 1000);
    total += computePlayDeltaSec(lastSeen, now);
    lastSeen = now;
  }
  assert.equal(total, intervalsSec * beats);
});
