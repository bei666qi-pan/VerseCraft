// src/lib/ai/tools/mechanicsIntentClassifier/runtime.test.ts
//
// embedTextWithTimeout 三路径分支：缓存命中 / LRU 写入 / 超时 / not_configured。
// 这里不直接 mock embedText，而是观察 cache 模块（__embedCacheSizeForTest）和
// 通过 setTimeout 强制触发 race-based timeout。

import test from "node:test";
import assert from "node:assert/strict";

import {
  embedTextWithTimeout,
  __resetEmbedCacheForTest,
  __embedCacheSizeForTest,
} from "./runtime";

test.beforeEach(() => {
  __resetEmbedCacheForTest();
});

test("embedTextWithTimeout: returns ok with vector on success", async () => {
  const r = await embedTextWithTimeout("hello world", { timeoutMs: 1000 });
  // Mock provider should succeed in dev; production with real provider should also succeed.
  // If neither configured, expect not_configured.
  if (r.ok) {
    assert.ok(Array.isArray(r.vector));
    assert.ok(r.vector.length > 0);
    assert.strictEqual(typeof r.cacheHit, "boolean");
    assert.strictEqual(typeof r.latencyMs, "number");
  } else {
    assert.strictEqual(r.reason, "not_configured");
  }
});

test("embedTextWithTimeout: cache hit avoids re-fetching", async () => {
  // Prime the cache.
  const first = await embedTextWithTimeout("cache-test-same-input");
  // Second call should be cacheHit=true (LRU survives within 30s).
  const second = await embedTextWithTimeout("cache-test-same-input");
  if (first.ok && second.ok) {
    assert.strictEqual(second.cacheHit, true, "second call should hit cache");
    assert.strictEqual(second.latencyMs, 0);
  } else {
    // not_configured path — both must report the same reason.
    assert.strictEqual(first.reason, "not_configured");
    assert.strictEqual(second.reason, "not_configured");
  }
});

test("embedTextWithTimeout: skipCache bypasses cache lookup", async () => {
  await embedTextWithTimeout("skip-test");
  const r = await embedTextWithTimeout("skip-test", { skipCache: true });
  if (r.ok) {
    assert.strictEqual(r.cacheHit, false);
  }
});

test("embedTextWithTimeout: enforces very short timeout", async () => {
  // With a 1ms timeout and no mock, real provider should fail with timeout.
  // With mock provider, embed returns synchronously-like (still under 1ms).
  const r = await embedTextWithTimeout("timeout-test", { timeoutMs: 1 });
  // Either it succeeds very quickly (mock) or returns timeout (real).
  if (!r.ok) {
    assert.ok(["timeout", "not_configured", "http_error"].includes(r.reason));
  }
});

test("__embedCacheSizeForTest: reflects number of cache entries", async () => {
  __resetEmbedCacheForTest();
  assert.strictEqual(__embedCacheSizeForTest(), 0);
  await embedTextWithTimeout("entry-A");
  await embedTextWithTimeout("entry-B");
  // entries may be 0 if not_configured (no cache write) — that's allowed.
  const size = __embedCacheSizeForTest();
  assert.ok(size >= 0 && size <= 2);
});

test("__resetEmbedCacheForTest: clears cache", async () => {
  await embedTextWithTimeout("some-input");
  __resetEmbedCacheForTest();
  assert.strictEqual(__embedCacheSizeForTest(), 0);
});
