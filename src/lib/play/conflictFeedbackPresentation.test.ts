import test from "node:test";
import assert from "node:assert/strict";
import { buildConflictFeedbackViewModel, envelopeIsConflictSignificant } from "./conflictFeedbackPresentation";
import type { ConflictOutcomeEnvelope } from "@/features/play/turnCommit/turnEnvelope";

test("envelopeIsConflictSignificant rejects empty shells", () => {
  assert.equal(envelopeIsConflictSignificant(null), false);
  assert.equal(envelopeIsConflictSignificant({ likelyCost: "unknown" }), false);
});

test("buildConflictFeedbackViewModel maps suppress + edge to pressure + 压制", () => {
  const env: ConflictOutcomeEnvelope = {
    outcomeTier: "edge",
    resultLayer: "suppress_success",
    likelyCost: "light",
    summary: "门在身后合上，像有人替你数拍子。",
  };
  const vm = buildConflictFeedbackViewModel({ envelope: env, sanityDamage: 0, relationUpdateCount: 0 });
  assert.ok(vm);
  assert.equal(vm!.situationLabel, "可压");
  assert.equal(vm!.resultTierLabel, "压制");
  assert.ok(vm!.opportunityLine.includes("机会窗"));
  assert.ok(vm!.costLine.includes("代价"));
});

test("buildConflictFeedbackViewModel escalates cost with sanity and relations", () => {
  const env: ConflictOutcomeEnvelope = {
    outcomeTier: "pressured",
    resultLayer: "forced_withdraw",
    likelyCost: "heavy",
  };
  const vm = buildConflictFeedbackViewModel({ envelope: env, sanityDamage: 4, relationUpdateCount: 2 });
  assert.ok(vm);
  assert.equal(vm!.situationLabel, "危险");
  assert.ok(vm!.costLine.includes("理智"));
  assert.ok(vm!.costLine.includes("关系"));
});

test("buildConflictFeedbackViewModel returns null when not significant", () => {
  const vm = buildConflictFeedbackViewModel({ envelope: { likelyCost: "unknown" }, sanityDamage: 0 });
  assert.equal(vm, null);
});
