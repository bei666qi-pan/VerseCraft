import test from "node:test";
import assert from "node:assert/strict";
import type { NarrativeBudget, NarrativeBudgetTier } from "@/lib/playRealtime/narrativeBudgetPackets";
import {
  applyNarrativeExpansionResultToDmRecord,
  parseNarrativeExpansionJson,
  shouldTriggerNarrativeExpansion,
  validateExpandedNarrativeCandidate,
  type NarrativeExpansionResult,
} from "@/lib/turnEngine/narrativeExpansion";
import type { NarrativeLengthTelemetry } from "@/lib/turnEngine/narrativeLengthTelemetry";

function budget(tier: NarrativeBudgetTier, maxChars = 520): NarrativeBudget {
  return {
    schema: "narrative_budget_v1",
    tier,
    minChars: 260,
    targetChars: 420,
    maxChars,
    minInfoBeats: 4,
    mustInclude: [],
    stopRule: "stop",
    reasonCodes: ["test"],
  };
}

function mediumTelemetry(tier: NarrativeBudgetTier = "standard"): NarrativeLengthTelemetry {
  return {
    narrativeBudgetTier: tier,
    narrativeBudgetReasonCodes: ["test"],
    narrativeMinChars: 260,
    narrativeTargetChars: 420,
    narrativeMaxChars: 520,
    actualNarrativeChars: 80,
    estimatedInfoBeats: 1,
    narrativeLengthSeverity: "medium",
    narrativeLengthIssueCodes: ["under_min", "far_under_min"],
    narrativeUnderMin: true,
    narrativeOverMax: false,
    playerChatMaxTokens: 1536,
    narrativeLengthStatus: "ok",
  };
}

test("parseNarrativeExpansionJson only exposes narrative and reports ignored fields", () => {
  const parsed = parseNarrativeExpansionJson(
    JSON.stringify({
      narrative: "走廊的灯闪了一下，我听见门缝里传来压低的呼吸声。",
      is_death: true,
      options: ["不该出现"],
    })
  );

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.narrative.includes("走廊"), true);
  assert.deepEqual(parsed.ignoredFieldKeys.sort(), ["is_death", "options"]);
});

test("validateExpandedNarrativeCandidate rejects over max chars", () => {
  const result = validateExpandedNarrativeCandidate({
    originalNarrative: "我推开门。",
    candidateNarrative: "走廊的冷风贴着手背掠过去。".repeat(20),
    budget: budget("standard", 60),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "over_max_chars");
});

test("applyNarrativeExpansionResultToDmRecord preserves original record on failed expansion", () => {
  const original = { narrative: "我推开门。", is_death: false, options: ["继续看"] };
  const failed: NarrativeExpansionResult = {
    ok: false,
    reason: "timeout",
    latencyMs: 6000,
    beforeChars: 5,
  };

  assert.equal(applyNarrativeExpansionResultToDmRecord(original, failed), original);
});

test("applyNarrativeExpansionResultToDmRecord replaces only narrative on success", () => {
  const original = { narrative: "我推开门。", is_death: false, options: ["继续看"] };
  const success: NarrativeExpansionResult = {
    ok: true,
    narrative: "我推开门，冷风从门缝里挤出来，走廊尽头的灯忽明忽暗。",
    latencyMs: 1000,
    beforeChars: 5,
    afterChars: 30,
    ignoredFieldKeys: ["is_death"],
  };

  const next = applyNarrativeExpansionResultToDmRecord(original, success);
  assert.notEqual(next, original);
  assert.equal(next.narrative, success.narrative);
  assert.equal(next.is_death, false);
  assert.deepEqual(next.options, ["继续看"]);
});

test("shouldTriggerNarrativeExpansion triggers only for enabled medium standard/reveal/climax turns", () => {
  const decision = shouldTriggerNarrativeExpansion({
    enabled: true,
    budget: budget("standard"),
    lengthTelemetry: mediumTelemetry("standard"),
    isActionLegal: true,
    performanceBudgetMs: 3000,
  });

  assert.equal(decision.trigger, true);
});

test("feature flag off does not trigger expansion", () => {
  const decision = shouldTriggerNarrativeExpansion({
    enabled: false,
    budget: budget("standard"),
    lengthTelemetry: mediumTelemetry("standard"),
  });

  assert.equal(decision.trigger, false);
  if (decision.trigger) return;
  assert.equal(decision.skippedReason, "feature_disabled");
});

test("micro does not trigger expansion", () => {
  const decision = shouldTriggerNarrativeExpansion({
    enabled: true,
    budget: budget("micro"),
    lengthTelemetry: mediumTelemetry("micro"),
  });

  assert.equal(decision.trigger, false);
  if (decision.trigger) return;
  assert.equal(decision.skippedReason, "tier_not_expandable");
});

test("safety fallback does not trigger expansion", () => {
  const decision = shouldTriggerNarrativeExpansion({
    enabled: true,
    budget: budget("reveal"),
    lengthTelemetry: mediumTelemetry("reveal"),
    isSafetyFallback: true,
  });

  assert.equal(decision.trigger, false);
  if (decision.trigger) return;
  assert.equal(decision.skippedReason, "safety_fallback");
});

test("illegal action does not trigger expansion", () => {
  const decision = shouldTriggerNarrativeExpansion({
    enabled: true,
    budget: budget("standard"),
    lengthTelemetry: mediumTelemetry("standard"),
    isActionLegal: false,
  });

  assert.equal(decision.trigger, false);
  if (decision.trigger) return;
  assert.equal(decision.skippedReason, "illegal_action");
});

test("death does not trigger expansion", () => {
  const decision = shouldTriggerNarrativeExpansion({
    enabled: true,
    budget: budget("climax"),
    lengthTelemetry: mediumTelemetry("climax"),
    isDeath: true,
  });

  assert.equal(decision.trigger, false);
  if (decision.trigger) return;
  assert.equal(decision.skippedReason, "death");
});
