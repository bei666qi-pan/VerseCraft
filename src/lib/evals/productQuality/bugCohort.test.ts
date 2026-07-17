import assert from "node:assert/strict";
import test from "node:test";
import { classifyBugCohort } from "./bugCohort";

test("actionable current observation is a current reproduction", () => {
  assert.equal(classifyBugCohort({ currentCount: 2, currentActionableCount: 1 }), "reproduced_current");
});

test("current guard-only observation is not an unresolved bug", () => {
  assert.equal(classifyBugCohort({ currentCount: 2, currentActionableCount: 0 }), "guard_observed_current");
});

test("absence in a small current sample is not called fixed", () => {
  assert.equal(classifyBugCohort({ currentCount: 0, currentActionableCount: 0 }), "historical_not_observed_in_current_sample");
});
