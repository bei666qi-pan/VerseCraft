import assert from "node:assert/strict";
import test from "node:test";

import { buildEvaluationRecommendation } from "./recommendation";
import type { TriagedDefect } from "./types";

function defect(category = "action_legality"): TriagedDefect {
  return {
    signature: {
      fingerprint: `${category}::rule::expected::actual`,
      category,
      ruleId: "rule",
      affectedSystem: "action_validation",
      normalizedExpected: "expected",
      normalizedActual: "actual",
    },
    severity: "major",
    sourceVerdicts: [],
    oracleReproduced: true,
    recommendationEligible: true,
    disposition: "explicit_implementation_recommended",
  };
}

test("recommendation requires an explicit implementation task and carries validation evidence", () => {
  const recommendation = buildEvaluationRecommendation(defect());

  assert.equal(recommendation.handoff, "explicit_implementation_task_required");
  assert.equal(recommendation.defectSignature.ruleId, "rule");
  assert.ok(recommendation.candidateFiles.length > 0);
  assert.ok(recommendation.requiredTests.some((entry) => entry.includes("Regression test")));
  assert.match(recommendation.approach, /Open an implementation task/);
  assert.equal("selected" in recommendation, false);
  assert.equal("success" in recommendation, false);
});

test("unknown categories remain advisory and do not invent candidate files", () => {
  const recommendation = buildEvaluationRecommendation(defect("unknown_category"));

  assert.deepEqual(recommendation.candidateFiles, []);
  assert.match(recommendation.approach, /explicit implementation task/i);
  assert.equal(recommendation.handoff, "explicit_implementation_task_required");
});
