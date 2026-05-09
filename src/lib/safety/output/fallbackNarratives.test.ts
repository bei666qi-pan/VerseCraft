import assert from "node:assert/strict";
import test from "node:test";
import { buildOutputFallback } from "@/lib/safety/output/fallbackNarratives";

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
  assert.match(result.narrative, /涉黄、涉暴|违法伤害/);
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

  assert.equal(result.narrative, "本回合未提交，请换个行动继续。");
  assert.equal(result.narrative.includes("门缝"), false);
  assert.equal(result.narrative.includes("电梯"), false);
});
