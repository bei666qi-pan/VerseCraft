import assert from "node:assert/strict";
import test from "node:test";
import { buildOutputFallback } from "@/lib/safety/output/fallbackNarratives";

test("private story output fallback remains in-world and does not expose safety-boundary copy", () => {
  const result = buildOutputFallback({
    scene: "private_story_output",
    stage: "post_model",
    decision: "fallback",
    riskLevel: "gray",
    reasonCode: "test",
    isProviderFailureFallback: false,
  });

  assert.equal(result.options?.length, 0);
  assert.ok(result.narrative.includes("门缝后的摩擦声停了一下"));
  assert.ok(result.narrative.includes("露出一个机会"));
  assert.equal(result.narrative.includes("叙事安全边界"), false);
  assert.equal(result.narrative.includes("触及安全边界"), false);
  assert.equal(result.narrative.includes("安全降级"), false);
});
