import assert from "node:assert/strict";
import test from "node:test";
import { buildOutputFallback } from "@/lib/safety/output/fallbackNarratives";
import { NARRATIVE_GUARD_IMMERSIVE_FALLBACK } from "@/lib/security/policy";

test("private story output fallback is procedural and not canned story", () => {
  const result = buildOutputFallback({
    scene: "private_story_output",
    stage: "post_model",
    decision: "fallback",
    riskLevel: "gray",
    reasonCode: "test",
    isProviderFailureFallback: false,
  });

  assert.equal(result.options?.length, 0);
  assert.equal(result.narrative, NARRATIVE_GUARD_IMMERSIVE_FALLBACK);
  assert.equal(result.narrative.includes("当前生成内容"), false);
  assert.equal(result.narrative.includes("老人"), false);
  assert.equal(result.narrative.includes("摩擦声"), false);
  assert.equal(result.narrative.includes("叙事安全边界"), false);
  assert.equal(result.narrative.includes("触及安全边界"), false);
});

test("generic output fallback is procedural and not scene reaction", () => {
  const result = buildOutputFallback({
    scene: "private_story_action",
    stage: "output",
    decision: "fallback",
    riskLevel: "gray",
    reasonCode: "test",
    isProviderFailureFallback: false,
  });

  assert.equal(result.narrative, NARRATIVE_GUARD_IMMERSIVE_FALLBACK);
  assert.equal(result.narrative.includes("当前生成内容"), false);
  assert.equal(result.narrative.includes("老人"), false);
  assert.equal(result.narrative.includes("摩擦声"), false);
  assert.equal(result.narrative.includes(["不合常理", "的话"].join("")), false);
  assert.equal(result.narrative.includes(["世界", "没有照做"].join("")), false);
  assert.equal(result.narrative.includes("叙事安全边界"), false);
});
