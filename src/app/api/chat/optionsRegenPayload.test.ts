import assert from "node:assert/strict";
import test from "node:test";
import { buildOptionsRegenResponse } from "./optionsRegenPayload";

test("buildOptionsRegenResponse: narrative_only hint still returns generated decision options", () => {
  const out = buildOptionsRegenResponse({ clientTurnModeHint: "narrative_only", options: ["a", "b"] });
  assert.equal(out.ok, true);
  assert.equal(out.turn_mode, "decision_required");
  assert.deepEqual(out.options, ["a", "b"]);
  assert.deepEqual(out.decision_options, ["a", "b"]);
});

test("buildOptionsRegenResponse: decision_required returns ok=true when >=2 options", () => {
  const out = buildOptionsRegenResponse({ clientTurnModeHint: "decision_required", options: ["a", "b", "c"] });
  assert.equal(out.ok, true);
  assert.equal(out.turn_mode, "decision_required");
  assert.deepEqual(out.options, ["a", "b", "c"]);
  assert.deepEqual(out.decision_options, ["a", "b", "c"]);
});

test("buildOptionsRegenResponse: insufficient options yields ok=false and empty options", () => {
  const out = buildOptionsRegenResponse({ clientTurnModeHint: "decision_required", options: ["a"], generatorOk: true });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "insufficient_options");
  assert.deepEqual(out.options, []);
});

