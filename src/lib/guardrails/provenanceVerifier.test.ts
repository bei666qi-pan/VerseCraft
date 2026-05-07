import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractNarrativeClaims,
  summarizeVerificationForTelemetry,
  verifyClaimsAgainstEvidence,
} from "./provenanceVerifier";
import type { LoreEvidenceBundleEntryV1 } from "@/lib/worldKnowledge/canon/types";

const baseEvidence: LoreEvidenceBundleEntryV1 = {
  factId: "npc:N-010:surface",
  canonicalText: "N-010 only shows surface familiarity at this reveal tier.",
  truthClass: "verified",
  audience: ["player", "present_npcs"],
  specificNpcIds: ["N-010"],
  revealMinRank: 0,
  evidenceRefs: [{ id: "registry:npc:N-010", sourceType: "registry" }],
  sourceType: "registry",
  gateDecision: "included",
  gateReason: "included",
};

test("provenance verifier flags deep identity reveal in shadow mode", () => {
  const claims = extractNarrativeClaims({
    narrative: "她忽然承认自己是校源徘徊者，也是学生会辅锚的一员。",
  });
  const result = verifyClaimsAgainstEvidence(claims, [
    baseEvidence,
    {
      ...baseEvidence,
      factId: "truth:deep_identity",
      canonicalText: "校源徘徊者 and 学生会辅锚 are deep reveal terms.",
      truthClass: "hidden",
      audience: ["dm"],
      revealMinRank: 2,
      gateDecision: "blocked",
      gateReason: "reveal_rank:2>0",
    },
  ]);
  assert.equal(result.shadowOnly, true);
  assert.ok(result.revealViolations.length >= 1);
  assert.notEqual(result.recommendedAction, "allow");
});

test("provenance verifier reports unsupported high-risk canon claims without mutating json", () => {
  const output = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "她说出了耶里档案的名字，但现场没有任何证据支持。",
    is_death: false,
    options: ["继续询问", "暂时退开"],
  };
  const before = JSON.stringify(output);
  const claims = extractNarrativeClaims(output);
  const result = verifyClaimsAgainstEvidence(claims, [baseEvidence]);
  const summary = summarizeVerificationForTelemetry(result);
  assert.ok(result.unsupportedClaims.length >= 1);
  assert.equal(summary.shadowOnly, true);
  assert.equal(JSON.stringify(output), before);
});
