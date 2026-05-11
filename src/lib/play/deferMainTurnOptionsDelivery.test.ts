import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldApplyDeferredOptionsStrip,
  shouldDeferStripPlayableOptionsForClient,
  stripPlayableOptionsForDeferredClientDelivery,
} from "./deferMainTurnOptionsDelivery";

test("shouldDeferStripPlayableOptionsForClient: rejects options_regen_only and illegal action", () => {
  assert.equal(
    shouldDeferStripPlayableOptionsForClient({
      clientPurpose: "options_regen_only",
      isActionLegal: true,
      dmLike: { is_action_legal: true, options: ["a", "b"] },
    }),
    false
  );
  assert.equal(
    shouldDeferStripPlayableOptionsForClient({
      clientPurpose: "play",
      isActionLegal: false,
      dmLike: { is_action_legal: false },
    }),
    false
  );
});

test("shouldApplyDeferredOptionsStrip: respects defer flag", () => {
  assert.equal(
    shouldApplyDeferredOptionsStrip(false, "play", { is_action_legal: true, options: ["x"] }),
    false
  );
  assert.equal(
    shouldApplyDeferredOptionsStrip(true, "play", { is_action_legal: true, options: ["x"] }),
    true
  );
});

test("stripPlayableOptionsForDeferredClientDelivery clears options and downgrades decision_required", () => {
  const stripped = stripPlayableOptionsForDeferredClientDelivery({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "Hello",
    is_death: false,
    turn_mode: "decision_required",
    decision_required: true,
    options: ["a", "b"],
    decision_options: ["a"],
  } as Parameters<typeof stripPlayableOptionsForDeferredClientDelivery>[0]);

  const rec = stripped as unknown as Record<string, unknown>;
  assert.deepEqual(rec.options, []);
  assert.deepEqual(rec.decision_options, []);
  assert.equal(rec.turn_mode, "narrative_only");
  assert.equal(rec.decision_required, false);
  assert.equal(typeof rec.auto_continue_hint, "string");
});
