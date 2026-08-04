import test from "node:test";
import assert from "node:assert/strict";
import { NARRATIVE_QUALITY_SAMPLES } from "@/lib/ai/qualityRegressionSamples";

test("quality regression samples should be available for narrative QA", () => {
  assert.ok(NARRATIVE_QUALITY_SAMPLES.length >= 3);
  for (const s of NARRATIVE_QUALITY_SAMPLES) {
    assert.match(s.id, /^[a-z_]+$/);
    assert.ok(s.userInput.length > 8);
    assert.match(s.userInput, /[\u4e00-\u9fff]/);
    assert.ok(s.playerContext.length > 8);
    assert.match(s.playerContext, /[\u4e00-\u9fff]/);
    assert.ok(s.focus.length > 4);
    assert.match(s.focus, /[\u4e00-\u9fff]/);
  }
});

