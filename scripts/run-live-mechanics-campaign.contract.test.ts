import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("live mechanics campaign does not synthesize profession certification after a DM turn", () => {
  const script = readFileSync("scripts/run-live-mechanics-campaign.ts", "utf8");
  assert.ok(!script.includes("postTurnStateReducer:"));
  assert.ok(!script.includes("certifyProfession("));
  assert.ok(script.includes('completedTaskIds.includes("prof_trial_lampkeeper")'));
  assert.match(script, /LIVE_MECHANICS_RUNS_PER_PERSONA/);
  assert.match(script, /mechanicChecksByRun/);
  assert.match(script, /"quest-delivery-missing-item": \["rulebreaker"\]/);
  assert.doesNotMatch(script, /runByScenario/);
});
