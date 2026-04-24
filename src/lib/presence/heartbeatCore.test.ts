// src/lib/presence/heartbeatCore.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  bucketStartUtcFromMs,
  computePlayDeltaSec,
  PRESENCE_MAX_PLAY_DELTA_SEC,
  shouldCountPresenceHeartbeat,
} from "@/lib/presence/heartbeatCore";

test("computePlayDeltaSec caps at 60s per beat", () => {
  const t0 = new Date("2020-01-01T00:00:00.000Z");
  const t120 = new Date("2020-01-01T00:02:00.000Z");
  assert.equal(computePlayDeltaSec(t0, t120), PRESENCE_MAX_PLAY_DELTA_SEC);
});

test("computePlayDeltaSec: 10 x 30s wall intervals sums to 300s (mirrors session last_seen → now chain)", () => {
  let lastSeen: Date | null = new Date(0);
  let total = 0;
  for (let i = 1; i <= 10; i += 1) {
    const now = new Date(i * 30_000);
    total += computePlayDeltaSec(lastSeen, now);
    lastSeen = now;
  }
  assert.equal(total, 300);
});

test("bucketStartUtcFromMs: two instants in same 10s bucket share the same start; next window differs", () => {
  const a = new Date("2020-01-01T00:00:01.200Z").getTime();
  const b = new Date("2020-01-01T00:00:08.800Z").getTime();
  assert.equal(bucketStartUtcFromMs(a).getTime(), bucketStartUtcFromMs(b).getTime());
  const c = new Date("2020-01-01T00:00:11.000Z").getTime();
  assert.notEqual(bucketStartUtcFromMs(a).getTime(), bucketStartUtcFromMs(c).getTime());
});

test("shouldCountPresenceHeartbeat requires visible and focus", () => {
  assert.equal(shouldCountPresenceHeartbeat({ visible: true, hasFocus: true }), true);
  assert.equal(shouldCountPresenceHeartbeat({ visible: false, hasFocus: true }), false);
  assert.equal(shouldCountPresenceHeartbeat({ visible: true, hasFocus: false }), false);
});
