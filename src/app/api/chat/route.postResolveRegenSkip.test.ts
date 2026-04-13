import test from "node:test";
import assert from "node:assert/strict";
import { getPostResolveOptionsRegenSkipReason, shouldSkipPostResolveOptionsRegen } from "@/app/api/chat/postResolveOptionsRegenSkip";

test("post-resolve options regen: decision_required semantic turn should not be skipped even if options empty", () => {
  const shouldSkip = shouldSkipPostResolveOptionsRegen({
    clientPurpose: null,
    shouldApplyFirstActionConstraint: false,
    settlementFreeze: false,
    resolved: { turn_mode: "decision_required" },
  });
  assert.equal(shouldSkip, false);
  assert.equal(
    getPostResolveOptionsRegenSkipReason({
      clientPurpose: null,
      shouldApplyFirstActionConstraint: false,
      settlementFreeze: false,
      resolved: { turn_mode: "decision_required" },
    }),
    "not_skipped"
  );
});

test("post-resolve options regen: explicit narrative_only should still allow post-body model options", () => {
  const shouldSkip = shouldSkipPostResolveOptionsRegen({
    clientPurpose: null,
    shouldApplyFirstActionConstraint: false,
    settlementFreeze: false,
    resolved: { turn_mode: "narrative_only" },
  });
  assert.equal(shouldSkip, false);
  assert.equal(
    getPostResolveOptionsRegenSkipReason({
      clientPurpose: null,
      shouldApplyFirstActionConstraint: false,
      settlementFreeze: false,
      resolved: { turn_mode: "narrative_only" },
    }),
    "not_skipped"
  );
});

test("post-resolve options regen: explicit system_transition should still allow post-body model options", () => {
  const shouldSkip = shouldSkipPostResolveOptionsRegen({
    clientPurpose: null,
    shouldApplyFirstActionConstraint: false,
    settlementFreeze: false,
    resolved: { turn_mode: "system_transition" },
  });
  assert.equal(shouldSkip, false);
  assert.equal(
    getPostResolveOptionsRegenSkipReason({
      clientPurpose: null,
      shouldApplyFirstActionConstraint: false,
      settlementFreeze: false,
      resolved: { turn_mode: "system_transition" },
    }),
    "not_skipped"
  );
});

test("post-resolve options regen: options_regen_only should be skipped to avoid recursion", () => {
  const shouldSkip = shouldSkipPostResolveOptionsRegen({
    clientPurpose: "options_regen_only",
    shouldApplyFirstActionConstraint: false,
    settlementFreeze: false,
    resolved: { turn_mode: "decision_required" },
  });
  assert.equal(shouldSkip, true);
  assert.equal(
    getPostResolveOptionsRegenSkipReason({
      clientPurpose: "options_regen_only",
      shouldApplyFirstActionConstraint: false,
      settlementFreeze: false,
      resolved: { turn_mode: "decision_required" },
    }),
    "options_regen_only"
  );
});

