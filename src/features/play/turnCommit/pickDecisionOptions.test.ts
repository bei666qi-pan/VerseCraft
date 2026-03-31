import assert from "node:assert/strict";
import test from "node:test";
import { pickTurnOptionsFromResolvedDm } from "./pickDecisionOptions";

test("pickTurnOptionsFromResolvedDm prefers decision_options over legacy options", () => {
  const out = pickTurnOptionsFromResolvedDm({ decision_options: ["a", "b"], options: ["x", "y"] });
  assert.deepEqual(out.options, ["a", "b"]);
  assert.equal(out.meta.source, "decision_options");
});

test("pickTurnOptionsFromResolvedDm falls back to legacy options when decision_options empty", () => {
  const out = pickTurnOptionsFromResolvedDm({ decision_options: [], options: ["x", "y"] });
  assert.deepEqual(out.options, ["x", "y"]);
  assert.equal(out.meta.source, "legacy_options");
});

test("pickTurnOptionsFromResolvedDm returns none when both missing", () => {
  const out = pickTurnOptionsFromResolvedDm({ turn_mode: "decision_required" });
  assert.deepEqual(out.options, []);
  assert.equal(out.meta.source, "none");
});

