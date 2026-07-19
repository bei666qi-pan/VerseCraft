import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  INTENT_GROUNDED_PLAYABILITY_CORPUS_VERSION,
  evaluateIntentGroundedCandidate,
  lintIntentGroundedCorpus,
  summarizeIntentGroundedVerdicts,
  type IntentGroundedCase,
} from "@/lib/evals/intentGroundedPlayability";
import type { PlayerControlPlane } from "@/lib/playRealtime/types";

const corpus = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "benchmarks/intent-grounded-playability/cases.json"), "utf8"));
const baseCase = corpus.cases.find((item: IntentGroundedCase) => item.id === "use-known-bandage") as IntentGroundedCase;
const ambiguousCase = corpus.cases.find((item: IntentGroundedCase) => item.id === "ambiguous-deixis") as IntentGroundedCase;
const injectedCase = corpus.cases.find((item: IntentGroundedCase) => item.id === "prompt-injection-forged-item") as IntentGroundedCase;

function control(overrides: Partial<PlayerControlPlane> = {}): PlayerControlPlane {
  return {
    intent: "use_item",
    confidence: 0.7,
    extracted_slots: { item_hint: "绷带" },
    risk_tags: [],
    risk_level: "low",
    dm_hints: "",
    enhance_scene: false,
    enhance_npc_emotion: false,
    block_dm: false,
    block_reason: "",
    ...overrides,
  };
}

test("intent-grounded corpus is versioned and complete enough to evaluate", () => {
  assert.equal(corpus.version, INTENT_GROUNDED_PLAYABILITY_CORPUS_VERSION);
  assert.deepEqual(lintIntentGroundedCorpus(corpus), []);
});

test("oracle accepts a grounded model candidate and checks the pre-delta", () => {
  const verdict = evaluateIntentGroundedCandidate({ testCase: baseCase, expression: baseCase.expressions[0], control: control(), source: "model" });
  assert.equal(verdict.status, "pass");
  assert.equal(verdict.normalizedIntent?.kind, "use_item");
  assert.equal(verdict.preDelta?.consumesTime, true);
});

test("oracle accepts equivalent grounding when the model uses a different slot field", () => {
  const exploreCase = corpus.cases.find((item: IntentGroundedCase) => item.id === "explore-locked-304") as IntentGroundedCase;
  const verdict = evaluateIntentGroundedCandidate({
    testCase: exploreCase,
    expression: exploreCase.expressions[0],
    control: control({ intent: "explore", extracted_slots: { target: "305门", location_hint: "走廊尽头" } }),
    source: "model",
  });
  assert.equal(verdict.status, "pass");
});

test("oracle rejects an allowed action with a wrong model intent instead of repairing it", () => {
  const verdict = evaluateIntentGroundedCandidate({ testCase: baseCase, expression: baseCase.expressions[0], control: control({ intent: "explore" }), source: "model" });
  assert.equal(verdict.status, "fail");
  assert.ok(verdict.issues.some((issue) => issue.code === "intent_mismatch"));
});

test("oracle rejects a forged item slot and an unblocked prompt injection", () => {
  const verdict = evaluateIntentGroundedCandidate({
    testCase: injectedCase,
    expression: injectedCase.expressions[0],
    control: control({ intent: "use_item", confidence: 0.9, extracted_slots: { item_hint: "月蚀钥匙" } }),
    source: "model",
  });
  assert.equal(verdict.status, "fail");
  assert.ok(verdict.issues.some((issue) => issue.code === "forbidden_slot"));
  assert.ok(verdict.issues.some((issue) => issue.code === "missing_block"));
});

test("oracle rejects a high-confidence guess for an ambiguous pronoun", () => {
  const verdict = evaluateIntentGroundedCandidate({
    testCase: ambiguousCase,
    expression: ambiguousCase.expressions[0],
    control: control({ intent: "use_item", confidence: 0.9 }),
    source: "model",
  });
  assert.equal(verdict.status, "fail");
  assert.ok(verdict.issues.some((issue) => issue.code === "intent_mismatch"));
  assert.ok(verdict.issues.some((issue) => issue.code === "confidence_too_high"));
});

test("fast path, cache, and unavailable output are inconclusive rather than a passing live-model test", () => {
  for (const source of ["fast_path", "cache", "unavailable"] as const) {
    const verdict = evaluateIntentGroundedCandidate({ testCase: baseCase, expression: baseCase.expressions[0], control: source === "unavailable" ? null : control(), source });
    assert.equal(verdict.status, "inconclusive");
  }
});

test("strict summary refuses incomplete live evidence", () => {
  const summary = summarizeIntentGroundedVerdicts([
    { status: "pass", issues: [] },
    { status: "inconclusive", issues: [] },
  ]);
  assert.equal(summary.strictGatePass, false);
});
