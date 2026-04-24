import test from "node:test";
import assert from "node:assert/strict";
import { formatOptionsRegenDebugHint, mapOptionRejectReasonToCodes } from "@/lib/play/optionsRegenObservability";

test("options regen observability: should map reject reasons to required reason codes", () => {
  const codes = mapOptionRejectReasonToCodes([
    "duplicate_current_recent",
    "missing_story_anchor",
    "generic_action",
    "homogeneity_rejected",
  ]);
  assert.equal(codes.includes("duplicated_rejected"), true);
  assert.equal(codes.includes("anchor_miss_rejected"), true);
  assert.equal(codes.includes("generic_rejected"), true);
  assert.equal(codes.includes("homogeneity_rejected"), true);
});

test("options regen observability: should format debug hint", () => {
  const hint = formatOptionsRegenDebugHint(["parse_failed", "repair_pass_used"]);
  assert.equal(hint, "options_regen_debug: parse_failed,repair_pass_used");
});

