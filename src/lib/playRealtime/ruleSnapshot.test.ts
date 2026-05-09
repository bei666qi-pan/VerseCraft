import test from "node:test";
import assert from "node:assert/strict";
import { buildRuleSnapshot } from "@/lib/playRealtime/ruleSnapshot";

test("ruleSnapshot treats short bare questions as dialogue hints", () => {
  const snapshot = buildRuleSnapshot("", "你是谁？");

  assert.equal(snapshot.in_dialogue_hint, true);
  assert.equal(snapshot.in_combat_hint, false);
});
