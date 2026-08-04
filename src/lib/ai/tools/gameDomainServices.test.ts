import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIdempotencyKey,
  checkIdempotency,
  recordIdempotency,
  __resetIdempotencyStore,
} from "./gameDomainServices";

// ── Idempotency Key Construction ──

test("buildIdempotencyKey joins requestId and toolKey with colon", () => {
  const key = buildIdempotencyKey("req-123", "issue_quest");
  assert.equal(key, "req-123:issue_quest");
});

test("buildIdempotencyKey handles special characters in requestId", () => {
  const key = buildIdempotencyKey("req/abc-456_789", "grant_item");
  assert.equal(key, "req/abc-456_789:grant_item");
});

test("buildIdempotencyKey different tools produce different keys", () => {
  const k1 = buildIdempotencyKey("req-1", "issue_quest");
  const k2 = buildIdempotencyKey("req-1", "grant_item");
  assert.notStrictEqual(k1, k2);
});

test("buildIdempotencyKey different requests produce different keys", () => {
  const k1 = buildIdempotencyKey("req-1", "issue_quest");
  const k2 = buildIdempotencyKey("req-2", "issue_quest");
  assert.notStrictEqual(k1, k2);
});

// ── Idempotency Check/Record Cycle ──

test("checkIdempotency returns null for unknown key", () => {
  __resetIdempotencyStore();
  const result = checkIdempotency("unknown:key");
  assert.equal(result, null);
});

test("recordIdempotency + checkIdempotency round-trip", () => {
  __resetIdempotencyStore();
  const key = buildIdempotencyKey("req-10", "grant_item");
  const toolResult = {
    success: true,
    data: { itemId: "rust_key", name: "生锈的钥匙" },
  };

  recordIdempotency(key, toolResult, "req-10");
  const found = checkIdempotency(key);

  assert.ok(found !== null);
  assert.equal(found!.success, true);
  assert.equal((found!.data as Record<string, unknown>).itemId, "rust_key");
});

test("idempotency isolates across different requestIds for same tool", () => {
  __resetIdempotencyStore();
  const k1 = buildIdempotencyKey("req-a", "issue_quest");
  const k2 = buildIdempotencyKey("req-b", "issue_quest");

  recordIdempotency(k1, { success: true, data: { qid: "q1" } }, "req-a");
  recordIdempotency(k2, { success: true, data: { qid: "q2" } }, "req-b");

  const r1 = checkIdempotency(k1);
  const r2 = checkIdempotency(k2);

  assert.equal((r1!.data as Record<string, unknown>).qid, "q1");
  assert.equal((r2!.data as Record<string, unknown>).qid, "q2");
});

test("idempotency check returns same result after repeated calls", () => {
  __resetIdempotencyStore();
  const key = buildIdempotencyKey("req-dup", "forge_weapon");
  const result = { success: false, error: { code: "INSUFFICIENT_MATERIALS", message: "材料不足" } };

  recordIdempotency(key, result, "req-dup");

  const check1 = checkIdempotency(key);
  const check2 = checkIdempotency(key);

  assert.deepStrictEqual(check1, check2);
});

test("idempotency does NOT match across different tools in same request", () => {
  __resetIdempotencyStore();
  const k1 = buildIdempotencyKey("req-same", "forge_weapon");
  const k2 = buildIdempotencyKey("req-same", "consume_materials");

  recordIdempotency(k1, { success: true, data: {} }, "req-same");

  const r1 = checkIdempotency(k1);
  const r2 = checkIdempotency(k2);

  assert.ok(r1 !== null);
  assert.equal(r2, null);
});

test("idempotency handles error results", () => {
  __resetIdempotencyStore();
  const key = buildIdempotencyKey("req-err", "start_combat");
  const errorResult = {
    success: false,
    error: { code: "NPC_NOT_FOUND", message: "目标NPC不存在" },
  };

  recordIdempotency(key, errorResult, "req-err");
  const found = checkIdempotency(key);

  assert.ok(found !== null);
  assert.equal(found!.success, false);
  assert.equal(found!.error!.code, "NPC_NOT_FOUND");
});

// ── Idempotency Store Reset ──

test("__resetIdempotencyStore clears all entries", () => {
  const key = buildIdempotencyKey("req-clear", "issue_quest");
  recordIdempotency(key, { success: true, data: {} }, "req-clear");
  assert.ok(checkIdempotency(key) !== null);

  __resetIdempotencyStore();
  assert.equal(checkIdempotency(key), null);
});

// ── Edge Cases ──

test("buildIdempotencyKey handles empty strings", () => {
  const key = buildIdempotencyKey("", "");
  assert.equal(key, ":");
});

test("checkIdempotency after reset returns null", () => {
  __resetIdempotencyStore();
  const key = buildIdempotencyKey("req-post-reset", "test");
  assert.equal(checkIdempotency(key), null);
});

test("recordIdempotency overwrites existing entry for same key", () => {
  __resetIdempotencyStore();
  const key = buildIdempotencyKey("req-overwrite", "test");

  recordIdempotency(key, { success: true, data: { v: 1 } }, "req-overwrite");
  recordIdempotency(key, { success: true, data: { v: 2 } }, "req-overwrite");

  const found = checkIdempotency(key);
  assert.equal((found!.data as Record<string, unknown>).v, 2);
});

// ── Stress: many keys ──

test("idempotency handles 100+ distinct keys without collision", () => {
  __resetIdempotencyStore();
  const keys: string[] = [];

  for (let i = 0; i < 100; i++) {
    const key = buildIdempotencyKey(`req-${i}`, `tool_${i % 8}`);
    keys.push(key);
    recordIdempotency(key, { success: true, data: { idx: i } }, `req-${i}`);
  }

  // Verify all 100 are independently retrievable
  for (let i = 0; i < 100; i++) {
    const found = checkIdempotency(keys[i]);
    assert.ok(found !== null, `Key ${i} not found`);
    assert.equal((found!.data as Record<string, unknown>).idx, i);
  }
});

test("idempotency store survives rapid sequential writes", () => {
  __resetIdempotencyStore();
  const key = buildIdempotencyKey("req-rapid", "test");
  for (let i = 0; i < 50; i++) {
    recordIdempotency(key, { success: true, data: { seq: i } }, "req-rapid");
  }
  const found = checkIdempotency(key);
  assert.equal((found!.data as Record<string, unknown>).seq, 49);
});
