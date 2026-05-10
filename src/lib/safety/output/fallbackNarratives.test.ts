import assert from "node:assert/strict";
import test from "node:test";
import { buildOutputFallback } from "@/lib/safety/output/fallbackNarratives";
import { VISIBLE_SAFETY_DEGRADE_MESSAGE } from "@/lib/security/visibleSafety";

test("private story output fallback uses explicit safety text for explicit reasons", () => {
  const result = buildOutputFallback({
    scene: "private_story_output",
    stage: "post_model",
    decision: "fallback",
    riskLevel: "gray",
    reasonCode: "private_explicit_details_rewrite",
    isProviderFailureFallback: false,
  });

  assert.equal(result.options?.length, 0);
  assert.equal(result.narrative, VISIBLE_SAFETY_DEGRADE_MESSAGE);
});

test("generic private output fallback is short and not immersive story text", () => {
  const result = buildOutputFallback({
    scene: "private_story_action",
    stage: "output",
    decision: "fallback",
    riskLevel: "gray",
    reasonCode: "provider_failed_fail_closed",
    isProviderFailureFallback: false,
  });

  assert.equal(result.narrative, "这一步已做安全改写，请继续当前行动。");
  assert.equal(result.narrative.includes("门缝"), false);
  assert.equal(result.narrative.includes("电梯"), false);
});

test("opening turn replaces visible safety degrade message with neutral chinese narrative", () => {
  const result = buildOutputFallback({
    scene: "private_story_output",
    stage: "post_model",
    decision: "fallback",
    riskLevel: "gray",
    reasonCode: "private_explicit_details_rewrite",
    isProviderFailureFallback: false,
    isOpeningTurn: true,
  });

  assert.equal(result.options?.length, 0);
  assert.notEqual(result.narrative, VISIBLE_SAFETY_DEGRADE_MESSAGE);
  assert.equal(result.narrative.includes("涉黄"), false);
  assert.equal(result.narrative.includes("涉暴"), false);
  assert.ok(result.narrative.length > 0);
});

test("opening turn private_story_action 也应避免吐出涉黄涉暴硬话术", () => {
  const result = buildOutputFallback({
    scene: "private_story_action",
    stage: "output",
    decision: "fallback",
    riskLevel: "gray",
    reasonCode: "private_explicit_details_rewrite",
    isProviderFailureFallback: false,
    isOpeningTurn: true,
  });

  assert.equal(result.narrative.includes("涉黄"), false);
  assert.equal(result.narrative.includes("涉暴"), false);
});
