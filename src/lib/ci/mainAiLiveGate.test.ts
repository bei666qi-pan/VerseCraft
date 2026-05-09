import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_GATE_CACHE_TTL_MS,
  classifyLiveGateFailure,
  isLiveGateCacheHit,
  resolveLiveGateBypass,
  shouldExitNonZero,
} from "@/lib/ci/mainAiLiveGate";

test("resolveLiveGateBypass requires a reason", () => {
  assert.deepEqual(resolveLiveGateBypass({ VC_LIVE_GATE_BYPASS: "1" }), {
    kind: "invalid",
    reason: "bypass_reason_missing",
  });
  assert.deepEqual(resolveLiveGateBypass({ VC_LIVE_GATE_BYPASS: "1", VC_LIVE_GATE_BYPASS_REASON: "gateway maintenance" }), {
    kind: "skipped",
    reason: "gateway maintenance",
  });
});

test("isLiveGateCacheHit accepts pass entries within 24 hours only", () => {
  const now = Date.now();
  assert.equal(
    isLiveGateCacheHit({ cacheKey: "a", status: "pass", createdAt: new Date(now - 1000).toISOString() }, "a", now),
    true
  );
  assert.equal(
    isLiveGateCacheHit({ cacheKey: "a", status: "pass", createdAt: new Date(now - LIVE_GATE_CACHE_TTL_MS - 1).toISOString() }, "a", now),
    false
  );
  assert.equal(
    isLiveGateCacheHit({ cacheKey: "a", status: "soft_failed", createdAt: new Date(now).toISOString() }, "a", now),
    false
  );
});

test("live gate is soft by default and strict only fails on soft_failed", () => {
  assert.deepEqual(classifyLiveGateFailure({ missingLiveEnable: true }), {
    status: "skipped",
    reason: "e2e_ai_live_not_enabled",
  });
  assert.deepEqual(classifyLiveGateFailure({ budgetExceeded: true }), {
    status: "soft_failed",
    reason: "budget_exceeded",
  });
  assert.equal(shouldExitNonZero("soft_failed", false), false);
  assert.equal(shouldExitNonZero("soft_failed", true), true);
  assert.equal(shouldExitNonZero("skipped", true), false);
});
