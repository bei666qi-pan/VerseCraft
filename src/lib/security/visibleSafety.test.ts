import test from "node:test";
import assert from "node:assert/strict";
import {
  isVisibleSafetyDegradeReason,
  visibleSafetyDegradeMessageFor,
  VISIBLE_SAFETY_DEGRADE_MESSAGE,
} from "@/lib/security/visibleSafety";

test("visible safety helper only exposes sexual and violence related safety categories", () => {
  assert.equal(isVisibleSafetyDegradeReason("explicit_sexual"), true);
  assert.equal(isVisibleSafetyDegradeReason("graphic_violence"), true);
  assert.equal(isVisibleSafetyDegradeReason("illegal_harm"), true);
  assert.equal(isVisibleSafetyDegradeReason({ categories: ["gore"] }), true);

  assert.equal(isVisibleSafetyDegradeReason("narrative_safety_kernel_high_severity"), false);
  assert.equal(isVisibleSafetyDegradeReason("unsupported_root_cause_claim"), false);
  assert.equal(isVisibleSafetyDegradeReason("json_parse_failed"), false);
  assert.equal(isVisibleSafetyDegradeReason("gateway_timeout"), false);
});

test("visible safety helper returns one stable player-facing message for visible safety", () => {
  assert.equal(visibleSafetyDegradeMessageFor("violence_extreme"), VISIBLE_SAFETY_DEGRADE_MESSAGE);
  assert.equal(visibleSafetyDegradeMessageFor("npc_consistency_bridge"), null);
});
