// src/lib/ai/governance/enhancementRulesPure.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateNarrativeEnhancementGate,
  sampleEnhancementAttempt,
} from "@/lib/ai/governance/enhancementRulesPure";
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";

const rule: PlayerRuleSnapshot = {
  in_combat_hint: true,
  in_dialogue_hint: true,
  location_changed_hint: false,
  high_value_scene: true,
};

test("evaluateNarrativeEnhancementGate blocks without control signals", () => {
  const control: PlayerControlPlane = {
    intent: "explore",
    confidence: 0.9,
    extracted_slots: {},
    risk_tags: [],
    risk_level: "low",
    dm_hints: "",
    enhance_scene: false,
    enhance_npc_emotion: false,
    block_dm: false,
    block_reason: "",
  };
  const r = evaluateNarrativeEnhancementGate({
    control,
    rule,
    playerContext: "",
    latestUserInput: "",
    isFirstAction: false,
    accumulatedDmJson: "{}",
  });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes("no_control_signal"));
});

test("evaluateNarrativeEnhancementGate allows high-value stack", () => {
  const control: PlayerControlPlane = {
    intent: "explore",
    confidence: 0.9,
    extracted_slots: {},
    risk_tags: [],
    risk_level: "low",
    dm_hints: "",
    enhance_scene: true,
    enhance_npc_emotion: false,
    block_dm: false,
    block_reason: "",
  };
  const r = evaluateNarrativeEnhancementGate({
    control,
    rule,
    playerContext: "我们来到第九层",
    latestUserInput: "观察守门人",
    isFirstAction: true,
    accumulatedDmJson: `{"bgm_track":"bgm_8_boss","sanity_damage":12}`,
  });
  assert.equal(r.allowed, true);
  assert.ok(r.score >= 32);
});

test("evaluateNarrativeEnhancementGate gateMinScore can block borderline scores", () => {
  const control: PlayerControlPlane = {
    intent: "explore",
    confidence: 0.9,
    extracted_slots: {},
    risk_tags: [],
    risk_level: "low",
    dm_hints: "",
    enhance_scene: true,
    enhance_npc_emotion: false,
    block_dm: false,
    block_reason: "",
  };
  const narrowRule: PlayerRuleSnapshot = {
    in_combat_hint: false,
    in_dialogue_hint: false,
    location_changed_hint: false,
    high_value_scene: true,
  };
  const r = evaluateNarrativeEnhancementGate({
    control,
    rule: narrowRule,
    playerContext: "",
    latestUserInput: "",
    isFirstAction: true,
    accumulatedDmJson: "{}",
    gateMinScore: 50,
  });
  assert.equal(r.allowed, false);
  assert.equal(r.score, 45);
});

test("sampleEnhancementAttempt respects forceAttempt", () => {
  const orig = Math.random;
  Math.random = () => 0.99;
  try {
    assert.equal(sampleEnhancementAttempt(true, 10), true);
    assert.equal(sampleEnhancementAttempt(false, 30), false);
  } finally {
    Math.random = orig;
  }
});
