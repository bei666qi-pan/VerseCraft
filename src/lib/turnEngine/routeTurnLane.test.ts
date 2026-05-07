import test from "node:test";
import assert from "node:assert/strict";
import type { NormalizedPlayerIntent } from "@/lib/turnEngine/types";
import { planTurnLaneSideEffects, routeTurnLane } from "@/lib/turnEngine/routeTurnLane";

function makeIntent(partial: Partial<NormalizedPlayerIntent> = {}): NormalizedPlayerIntent {
  return {
    rawText: "我继续走",
    normalizedText: "我继续走",
    kind: "explore",
    slots: {},
    riskTags: [],
    isSystemTransition: false,
    isFirstAction: false,
    clientPurpose: "normal",
    ...partial,
  };
}

test("routeTurnLane returns FAST for options_regen_only", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ clientPurpose: "options_regen_only", kind: "meta" }),
    riskLane: "slow",
    focusNpcId: null,
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "FAST");
  assert.ok(decision.reasons.includes("options_regen_only"));
  assert.equal(decision.confidence, "high");
  assert.equal(decision.sideEffectPlan.skipRuntimeLore, true);
  assert.equal(decision.sideEffectPlan.compactPrompt, true);
  assert.equal(decision.sideEffectPlan.requireNarrativeSafetyHardGate, true);
});

test("routeTurnLane returns RULE for system_transition input", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ isSystemTransition: true, kind: "system_transition" }),
    riskLane: "fast",
    focusNpcId: null,
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "RULE");
  assert.ok(decision.reasons.includes("system_transition_input"));
});

test("routeTurnLane returns RULE for opening first action", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ isFirstAction: true }),
    riskLane: "fast",
    focusNpcId: null,
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "RULE");
  assert.ok(decision.reasons.includes("opening_first_action_constraint"));
});

test("routeTurnLane routes explicit reveal phrases to REVEAL when epistemic enabled", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ rawText: "你到底是谁？告诉我真相。" }),
    riskLane: "slow",
    focusNpcId: null,
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "REVEAL");
  assert.ok(decision.reasons.includes("explicit_reveal_intent"));
  assert.equal(decision.sideEffectPlan.requireFullEpistemic, true);
  assert.equal(decision.sideEffectPlan.requireNpcConsistency, true);
  assert.equal(decision.sideEffectPlan.requireNarrativeSafetyHardGate, true);
});

test("routeTurnLane explicit reveal falls back to RULE when epistemic disabled", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ rawText: "你藏了什么，说清楚。" }),
    riskLane: "slow",
    focusNpcId: null,
    epistemicEnabled: false,
  });
  assert.equal(decision.lane, "RULE");
  assert.ok(decision.reasons.includes("explicit_reveal_intent"));
});

test("routeTurnLane routes investigate kind to REVEAL when epistemic enabled", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ kind: "investigate", rawText: "我仔细检查桌上的纸条" }),
    riskLane: "slow",
    focusNpcId: null,
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "REVEAL");
  assert.ok(decision.reasons.includes("investigation_intent"));
});

test("routeTurnLane routes dialogue-with-focus to REVEAL when epistemic enabled", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ kind: "dialogue", rawText: "我问老王他昨晚在哪" }),
    riskLane: "slow",
    focusNpcId: "N-001",
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "REVEAL");
  assert.ok(decision.reasons.includes("dialogue_with_epistemic_focus"));
});

test("routeTurnLane routes combat to RULE", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ kind: "combat" }),
    riskLane: "fast",
    focusNpcId: null,
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "RULE");
  assert.ok(decision.reasons.includes("combat_intent"));
});

test("routeTurnLane routes high risk tags to RULE", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ riskTags: ["suicide_hint"] }),
    riskLane: "fast",
    focusNpcId: null,
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "RULE");
  assert.ok(decision.reasons.includes("high_risk_tags"));
  assert.equal(decision.sideEffectPlan.skipRuntimeLore, false);
  assert.equal(decision.sideEffectPlan.compactPrompt, false);
  assert.equal(decision.sideEffectPlan.requireNarrativeSafetyHardGate, true);
});

test("routeTurnLane uses director tension to force RULE", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ rawText: "继续" }),
    riskLane: "fast",
    focusNpcId: null,
    directorTension: 92,
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "RULE");
  assert.ok(decision.reasons.includes("high_tension_director"));
});

test("routeTurnLane returns FAST for short ack on fast risk lane", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ rawText: "继续" }),
    riskLane: "fast",
    focusNpcId: null,
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "FAST");
  assert.ok(decision.reasons.includes("short_acknowledgement"));
  assert.ok(decision.reasons.includes("fast_risk_lane"));
  assert.deepEqual(decision.sideEffectPlan, planTurnLaneSideEffects("FAST"));
});

test("routeTurnLane defaults to RULE when nothing matches", () => {
  const decision = routeTurnLane({
    intent: makeIntent({ rawText: "我端起马克杯慢慢喝着咖啡看着窗外的雨滴" }),
    riskLane: "slow",
    focusNpcId: null,
    epistemicEnabled: true,
  });
  assert.equal(decision.lane, "RULE");
  assert.ok(decision.reasons.includes("default_rule"));
});

test("planTurnLaneSideEffects is deterministic and keeps safety gates on every lane", () => {
  assert.deepEqual(planTurnLaneSideEffects("FAST"), {
    skipRuntimeLore: true,
    compactPrompt: true,
    requireFullEpistemic: false,
    requireNpcConsistency: true,
    requireNarrativeSafetyHardGate: true,
    requirePacingValidation: false,
  });
  assert.deepEqual(planTurnLaneSideEffects("RULE"), {
    skipRuntimeLore: false,
    compactPrompt: false,
    requireFullEpistemic: false,
    requireNpcConsistency: true,
    requireNarrativeSafetyHardGate: true,
    requirePacingValidation: true,
  });
  assert.deepEqual(planTurnLaneSideEffects("REVEAL"), {
    skipRuntimeLore: false,
    compactPrompt: false,
    requireFullEpistemic: true,
    requireNpcConsistency: true,
    requireNarrativeSafetyHardGate: true,
    requirePacingValidation: true,
  });
});
