import test from "node:test";
import assert from "node:assert/strict";
import type { PlayerControlPlane } from "@/lib/playRealtime/types";
import { normalizePlayerInput } from "@/lib/turnEngine/normalizePlayerInput";

function makeControl(partial: Partial<PlayerControlPlane> = {}): PlayerControlPlane {
  return {
    intent: "other",
    confidence: 0.5,
    extracted_slots: {},
    risk_tags: [],
    risk_level: "low",
    dm_hints: "",
    enhance_scene: false,
    enhance_npc_emotion: false,
    block_dm: false,
    block_reason: "",
    ...partial,
  };
}

test("normalizePlayerInput preserves raw text and derives normalized form", () => {
  const intent = normalizePlayerInput({
    latestUserInput: "  我走向 门口，看看 门后。  ",
    control: null,
    isFirstAction: false,
    shouldApplyFirstActionConstraint: false,
    clientPurpose: "normal",
  });
  assert.equal(intent.rawText, "  我走向 门口，看看 门后。  ");
  assert.equal(intent.normalizedText, "我走向门口看看门后");
  assert.equal(intent.kind, "explore");
  assert.equal(intent.isFirstAction, false);
  assert.equal(intent.isSystemTransition, false);
  assert.equal(intent.clientPurpose, "normal");
});

test("normalizePlayerInput detects system transition input", () => {
  const intent = normalizePlayerInput({
    latestUserInput: "迎接终焉",
    control: null,
    isFirstAction: false,
    shouldApplyFirstActionConstraint: false,
    clientPurpose: "normal",
  });
  assert.equal(intent.kind, "system_transition");
  assert.equal(intent.isSystemTransition, true);
});

test("normalizePlayerInput uses control preflight intent when provided", () => {
  const intent = normalizePlayerInput({
    latestUserInput: "我向老王问询昨晚的事",
    control: makeControl({
      intent: "dialogue",
      extracted_slots: { target: "老王" },
      risk_tags: ["social_pressure"],
    }),
    isFirstAction: false,
    shouldApplyFirstActionConstraint: false,
    clientPurpose: "normal",
  });
  assert.equal(intent.kind, "dialogue");
  assert.deepEqual(intent.slots, { target: "老王" });
  assert.deepEqual(intent.riskTags, ["social_pressure"]);
});

test("normalizePlayerInput forces options_regen_only to meta kind", () => {
  const intent = normalizePlayerInput({
    latestUserInput: "攻击敌人",
    control: makeControl({ intent: "combat" }),
    isFirstAction: false,
    shouldApplyFirstActionConstraint: false,
    clientPurpose: "options_regen_only",
  });
  assert.equal(intent.kind, "meta");
  assert.equal(intent.clientPurpose, "options_regen_only");
});

test("normalizePlayerInput falls back to heuristic when control is other", () => {
  const intent = normalizePlayerInput({
    latestUserInput: "我挥刀砍向黑影",
    control: makeControl({ intent: "other" }),
    isFirstAction: false,
    shouldApplyFirstActionConstraint: false,
    clientPurpose: "normal",
  });
  assert.equal(intent.kind, "combat");
});

test("normalizePlayerInput clamps raw text length", () => {
  const long = "我".repeat(2000);
  const intent = normalizePlayerInput({
    latestUserInput: long,
    control: null,
    isFirstAction: false,
    shouldApplyFirstActionConstraint: false,
    clientPurpose: "normal",
    maxRawChars: 100,
  });
  assert.equal(intent.rawText.length, 100);
});

test("normalizePlayerInput passes through risk tags from explicit arg", () => {
  const intent = normalizePlayerInput({
    latestUserInput: "观察四周",
    control: makeControl({ risk_tags: ["ignored"] }),
    riskTags: ["from_classifier"],
    isFirstAction: true,
    shouldApplyFirstActionConstraint: true,
    clientPurpose: "normal",
  });
  assert.deepEqual(intent.riskTags, ["from_classifier"]);
  assert.equal(intent.isFirstAction, true);
});
