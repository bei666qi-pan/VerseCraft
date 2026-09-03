import assert from "node:assert/strict";
import test from "node:test";
import { buildOptionsRegenResponse } from "./optionsRegenPayload";

test("buildOptionsRegenResponse: narrative_only hint still returns generated decision options", () => {
  const out = buildOptionsRegenResponse({ clientTurnModeHint: "narrative_only", options: ["a", "b", "c", "d"] });
  assert.equal(out.ok, true);
  assert.equal(out.turn_mode, "decision_required");
  assert.deepEqual(out.options, ["a", "b", "c", "d"]);
  assert.deepEqual(out.decision_options, ["a", "b", "c", "d"]);
});

test("buildOptionsRegenResponse: decision_required returns ok=true only with four options", () => {
  const out = buildOptionsRegenResponse({ clientTurnModeHint: "decision_required", options: ["a", "b", "c", "d"] });
  assert.equal(out.ok, true);
  assert.equal(out.turn_mode, "decision_required");
  assert.deepEqual(out.options, ["a", "b", "c", "d"]);
  assert.deepEqual(out.decision_options, ["a", "b", "c", "d"]);
});

test("buildOptionsRegenResponse: insufficient options yields ok=false and empty options", () => {
  const out = buildOptionsRegenResponse({ clientTurnModeHint: "decision_required", options: ["a", "b", "c"], generatorOk: true });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "insufficient_options");
  assert.deepEqual(out.options, []);
  assert.equal(Array.isArray(out.debug_reason_codes), true);
});

test("buildOptionsRegenResponse: upstream failure preserves diagnostic reason codes", () => {
  const out = buildOptionsRegenResponse({
    clientTurnModeHint: "decision_required",
    options: [],
    generatorOk: false,
    debugReasonCodes: ["empty_content", "parse_failed"],
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "upstream_generate_failed");
  assert.deepEqual(out.options, []);
  assert.deepEqual(out.debug_reason_codes, ["empty_content", "parse_failed"]);
});

