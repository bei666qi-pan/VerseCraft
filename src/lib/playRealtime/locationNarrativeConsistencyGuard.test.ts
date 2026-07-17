import test from "node:test";
import assert from "node:assert/strict";
import { applyLocationNarrativeConsistencyGuard } from "./locationNarrativeConsistencyGuard";

test("blocks prose-only multi-floor traversal", () => {
  const out = applyLocationNarrativeConsistencyGuard({
    dmRecord: { narrative: "我下到2F，继续下到1F，然后穿过铁门到B1。" },
    clientState: { playerLocation: "3F_Hallway" },
  });
  assert.equal(out.is_action_legal, false);
  assert.match(String(out.narrative), /仍留在3F_Hallway/);
});

test("keeps atmosphere mentioning one floor", () => {
  const input = { narrative: "3F的灯闪了一下，我停在原地。" };
  assert.equal(applyLocationNarrativeConsistencyGuard({ dmRecord: input, clientState: { playerLocation: "3F_Hallway" } }), input);
});
