import assert from "node:assert/strict";
import test from "node:test";
import { classifyRunEvidence, resolveEvalExecutionMode } from "./runOutcome";

const base = { executionMode: "live_full", terminatedReason: "max_steps", judgePassed: true, gameplayGatePassed: false, executedSteps: 2, plannedScenarioSteps: 6 };

test("deliberately truncated specialist probe is inconclusive, not failed", () => {
  assert.equal(classifyRunEvidence(base), "inconclusive");
});

test("completed scenario missing its required outcome is a real failure", () => {
  assert.equal(classifyRunEvidence({ ...base, executedSteps: 6 }), "fail");
});

test("degraded transport and judge failure remain failures even when truncated", () => {
  assert.equal(classifyRunEvidence({ ...base, executionMode: "live_degraded" }), "fail");
  assert.equal(classifyRunEvidence({ ...base, judgePassed: false }), "fail");
});

test("passing gameplay gate is pass", () => {
  assert.equal(classifyRunEvidence({ ...base, gameplayGatePassed: true }), "pass");
});

test("missing final / transport error can never be labeled live_full", () => {
  assert.equal(resolveEvalExecutionMode({ live: true, degradedSteps: 0, terminatedReason: "error" }), "live_degraded");
  assert.equal(resolveEvalExecutionMode({ live: true, degradedSteps: 0, terminatedReason: "max_steps" }), "live_full");
  assert.equal(resolveEvalExecutionMode({ live: false, degradedSteps: 3, terminatedReason: "error" }), "mock_full");
});
