import test from "node:test";
import assert from "node:assert/strict";
import { buildPreflightFingerprintV2 } from "@/lib/ai/governance/preflightCacheKey";

test("preflight fingerprint v2 is stable against unrelated context expansion", () => {
  const base = buildPreflightFingerprintV2({
    latestUserInput: "我去钟楼！",
    ruleFlags: {
      in_combat_hint: false,
      in_dialogue_hint: false,
      location_changed_hint: true,
      high_value_scene: false,
    },
    digest: {
      location: { current: "街口" },
      entity_hints: ["N-011"],
      state_change_hints: ["获得 钥匙"],
    },
  });

  // Simulate "context noise" that should not affect digest-derived key.
  const noisy = buildPreflightFingerprintV2({
    latestUserInput: "  我去  钟楼！！  ",
    ruleFlags: {
      in_combat_hint: false,
      in_dialogue_hint: false,
      location_changed_hint: true,
      high_value_scene: false,
    },
    digest: {
      location: { current: "街口" },
      entity_hints: ["N-011", "N-011", "  "],
      state_change_hints: ["获得   钥匙", "获得   钥匙"],
      context_anchor: "这是一段很长的上下文……但不会被完整纳入 key",
    },
  });

  assert.equal(base, noisy);
});

test("preflight fingerprint v2 changes when rule flags differ", () => {
  const a = buildPreflightFingerprintV2({
    latestUserInput: "我去钟楼",
    ruleFlags: {
      in_combat_hint: false,
      in_dialogue_hint: false,
      location_changed_hint: true,
      high_value_scene: false,
    },
  });
  const b = buildPreflightFingerprintV2({
    latestUserInput: "我去钟楼",
    ruleFlags: {
      in_combat_hint: true,
      in_dialogue_hint: false,
      location_changed_hint: true,
      high_value_scene: false,
    },
  });
  assert.notEqual(a, b);
});

