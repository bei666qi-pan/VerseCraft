import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatRequestFinishedPayload,
  optionalFiniteInt,
  toEnhanceTurnMetrics,
} from "@/lib/analytics/chatRequestFinishedPayload";

test("optionalFiniteInt rejects NaN and negative", () => {
  assert.equal(optionalFiniteInt(undefined), null);
  assert.equal(optionalFiniteInt(null), null);
  assert.equal(optionalFiniteInt(NaN), null);
  assert.equal(optionalFiniteInt("x"), null);
  assert.equal(optionalFiniteInt(-1), null);
  assert.equal(optionalFiniteInt(42), 42);
  assert.equal(optionalFiniteInt("12"), 12);
});

test("buildChatRequestFinishedPayload fills token fields and nulls invalid usage", () => {
  const base = {
    requestId: "r1",
    model: "main",
    gatewayModel: "gpt-test",
    success: true,
    firstChunkAt: 100,
    requestStartedAt: 50,
    finishedAt: 500,
    isFirstAction: false,
    routing: {
      operationMode: "full" as const,
      intendedRole: "main" as const,
      fallbackCount: 0,
      actualLogicalRole: "main" as const,
    },
    stableCharLen: 10,
    dynamicCharLen: 20,
    latestUsage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cachedPromptTokens: 80,
    },
    preflight: {
      ran: true,
      skippedReason: null,
      cacheHit: true,
      latencyMs: 0,
      ok: true,
      budgetHit: false,
    },
    enhance: {
      attempted: true,
      outcome: "skipped" as const,
      skipReason: "sampled_out",
      latencyMs: 5,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    },
    streamReconnectCount: 1,
    streamInterruptedCount: 0,
    streamEmptyCount: 1,
    finalJsonParseSuccess: true,
    settlementGuardApplied: true,
    settlementAwardPruned: 2,
  };
  const p = buildChatRequestFinishedPayload(base);
  assert.equal(p.promptTokens, 100);
  assert.equal(p.completionTokens, 50);
  assert.equal(p.totalTokens, 150);
  assert.equal(p.cachedPromptTokens, 80);
  assert.equal(p.firstChunkLatencyMs, 50);
  assert.equal(p.totalLatencyMs, 450);
  assert.equal(p.preflightCacheHit, true);
  assert.equal(p.enhanceSkipReason, "sampled_out");
  assert.equal(p.streamReconnectCount, 1);
  assert.equal(p.streamEmptyCount, 1);
  assert.equal(p.fallbackRate, 0);
  assert.equal(p.emptyFirstChunkRate, 1);
  assert.equal(p.statusFrameCount, null);
  assert.equal(p.statusShownRate, 0);
  assert.equal(p.finalJsonParseSuccess, true);
  assert.equal(p.settlementGuardApplied, true);
  assert.equal(p.settlementAwardPruned, 2);
});

test("toEnhanceTurnMetrics maps applied and exception", () => {
  assert.deepEqual(
    toEnhanceTurnMetrics(false, null),
    expectShapeNone()
  );
  const applied = toEnhanceTurnMetrics(true, {
    kind: "applied",
    wallMs: 12,
    usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 },
  });
  assert.equal(applied.outcome, "applied");
  assert.equal(applied.promptTokens, 3);
  assert.equal(applied.completionTokens, 5);
  assert.equal(applied.totalTokens, 8);
  const err = toEnhanceTurnMetrics(true, {
    kind: "skipped",
    reason: "exception",
    wallMs: 9,
  });
  assert.equal(err.outcome, "error");
  assert.equal(err.skipReason, "exception");
});

function expectShapeNone() {
  return {
    attempted: false,
    outcome: "none" as const,
    skipReason: null,
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
  };
}

test("buildChatRequestFinishedPayload derives totalTokens from prompt+completion", () => {
  const p = buildChatRequestFinishedPayload({
    requestId: "r2",
    model: "main",
    success: true,
    firstChunkAt: 0,
    requestStartedAt: 0,
    finishedAt: 100,
    isFirstAction: true,
    routing: {
      operationMode: "full",
      intendedRole: "main",
      fallbackCount: 0,
    },
    stableCharLen: 1,
    dynamicCharLen: 2,
    latestUsage: { promptTokens: 10, completionTokens: 3 },
    preflight: {
      ran: false,
      skippedReason: "emergency",
      cacheHit: null,
      latencyMs: null,
      ok: false,
      budgetHit: false,
    },
    enhance: {
      attempted: false,
      outcome: "none",
      skipReason: null,
      latencyMs: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    },
    streamReconnectCount: 0,
    streamInterruptedCount: 0,
    streamEmptyCount: 0,
    finalJsonParseSuccess: false,
    settlementGuardApplied: false,
    settlementAwardPruned: 0,
  });
  assert.equal(p.totalTokens, 13);
  assert.equal(p.firstChunkLatencyMs, null);
  assert.equal(p.fallbackRate, 0);
  assert.equal(p.emptyFirstChunkRate, 0);
  assert.equal(p.finalJsonParseSuccess, false);
  assert.equal(p.settlementGuardApplied, false);
  assert.equal(p.settlementAwardPruned, 0);
});
