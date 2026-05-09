import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldShowComplianceHintForDmMeta } from "@/features/play/safetyCompliance";

test("safety compliance hint only shows for explicit sexual or violent metadata", () => {
  assert.equal(
    shouldShowComplianceHintForDmMeta(
      { security_meta: { reason: "input_reject:legal_redline", category: "explicit_sexual|illegal_harm" } },
      false
    ),
    true
  );
  assert.equal(
    shouldShowComplianceHintForDmMeta(
      { security_meta: { reason: "input_reject:legal_redline", category: "graphic_violence" } },
      false
    ),
    true
  );
});

test("safety compliance hint ignores validator, quota, network, and opening system rounds", () => {
  assert.equal(
    shouldShowComplianceHintForDmMeta({ security_meta: { reason: "narrative_validator_repair_failed" } }, false),
    false
  );
  assert.equal(
    shouldShowComplianceHintForDmMeta({ security_meta: { reason: "rate_limit", category: "queue" } }, false),
    false
  );
  assert.equal(
    shouldShowComplianceHintForDmMeta({ security_meta: { reason: "input_reject:legal_redline", category: "explicit_gore" } }, true),
    false
  );
});
