import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultPreflightMetrics, resolveRiskLane, runControlPreflightStage } from "@/lib/turnEngine/preflight";

test("createDefaultPreflightMetrics starts in skipped state", () => {
  assert.deepEqual(createDefaultPreflightMetrics(), {
    ran: false,
    skippedReason: null,
    cacheHit: null,
    latencyMs: null,
    ok: false,
    budgetHit: false,
  });
});

test("resolveRiskLane honors disabled split", () => {
  const lane = resolveRiskLane({
    perfFlags: {
      enableRiskLaneSplit: false,
      enableLightweightFastPath: true,
      enablePromptSlimming: true,
      fastLaneSkipRuntimePackets: true,
      tieredContextBuild: true,
      controlPreflightBudgetMsCap: 100,
      loreRetrievalBudgetMsCap: 100,
    },
    latestUserInput: "查看周围",
  });
  assert.equal(lane.lane, "slow");
});

test("runControlPreflightStage skips fast lane before calling model", async () => {
  let called = false;
  const result = await runControlPreflightStage({
    perfFlags: {
      enableRiskLaneSplit: true,
      enableLightweightFastPath: true,
      enablePromptSlimming: true,
      fastLaneSkipRuntimePackets: true,
      tieredContextBuild: true,
      controlPreflightBudgetMsCap: 100,
      loreRetrievalBudgetMsCap: 100,
    },
    riskLane: "fast",
    sessionId: "sess",
    latestUserInput: "查看周围",
    playerContext: "ctx",
    pipelineRule: {
      in_combat_hint: false,
      in_dialogue_hint: false,
      location_changed_hint: false,
      high_value_scene: false,
    },
    requestId: "req",
    userId: "user",
    controlPreflightBudgetMs: 100,
    allowControlPreflightForSessionImpl: () => true,
    resolveOperationModeImpl: () => "full",
    parsePlayerIntentImpl: async () => {
      called = true;
      throw new Error("should not be called");
    },
  });

  assert.equal(called, false);
  assert.equal(result.preflightTurnMetrics.skippedReason, "fast_lane");
});

test("runControlPreflightStage captures successful control result", async () => {
  const result = await runControlPreflightStage({
    perfFlags: {
      enableRiskLaneSplit: true,
      enableLightweightFastPath: false,
      enablePromptSlimming: true,
      fastLaneSkipRuntimePackets: true,
      tieredContextBuild: true,
      controlPreflightBudgetMsCap: 100,
      loreRetrievalBudgetMsCap: 100,
    },
    riskLane: "slow",
    sessionId: "sess",
    latestUserInput: "查看周围",
    playerContext: "ctx",
    pipelineRule: {
      in_combat_hint: false,
      in_dialogue_hint: false,
      location_changed_hint: false,
      high_value_scene: false,
    },
    requestId: "req",
    userId: "user",
    controlPreflightBudgetMs: 0,
    allowControlPreflightForSessionImpl: () => true,
    resolveOperationModeImpl: () => "full",
    parsePlayerIntentImpl: async () => ({
      ok: true as const,
      control: {
        intent: "explore" as const,
        confidence: 0.9,
        extracted_slots: {},
        risk_tags: [],
        risk_level: "low" as const,
        dm_hints: "",
        enhance_scene: false,
        enhance_npc_emotion: false,
        block_dm: false,
        block_reason: "",
      },
      latencyMs: 12,
      fromCache: true,
    }),
  });

  assert.equal(result.pipelinePreflightFailed, false);
  assert.equal(result.pipelineControl?.intent, "explore");
  assert.equal(result.preflightTurnMetrics.cacheHit, true);
});
