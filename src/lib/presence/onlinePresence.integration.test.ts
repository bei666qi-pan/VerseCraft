// src/lib/presence/onlinePresence.integration.test.ts
/**
 * In-process integration: merged online keys when Redis is unavailable (null) must still
 * include every DB actor — simulates Redis outage without a real Upstash instance.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeOnlineActorKeys } from "@/lib/presence/mergeOnlineActorKeys";

test("mergeOnlineActorKeys: null Redis (故障/未配置) + DB actors => 全部在合并结果中且不算 flaky 信号", () => {
  const r = mergeOnlineActorKeys(null, ["user-a", "user-b"], ["g:guest-1"]);
  assert.equal(r.redisDown, true);
  assert.deepEqual(new Set(r.merged), new Set(["user-a", "user-b", "g:guest-1"]));
  assert.equal(r.dbOnly, 0);
});

test("mergeOnlineActorKeys: Redis 空数组 + DB 命中 => 记 dbOnly（用于 presence_flaky）", () => {
  const r = mergeOnlineActorKeys([], ["uid"], []);
  assert.equal(r.redisDown, false);
  assert.equal(r.dbOnly, 1);
  assert.equal(r.merged[0], "uid");
});
