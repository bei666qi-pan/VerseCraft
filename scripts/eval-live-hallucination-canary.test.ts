import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDenialAwareCase,
  hasUnsafeTermOccurrence,
  visibleTextFromFinalJson,
} from "./eval-live-hallucination-canary";
import type { NarrativeSafetyEvalCase } from "../src/lib/evals/narrativeSafetyRubric";

test("visibleTextFromFinalJson includes narrative and player-visible options", () => {
  assert.equal(
    visibleTextFromFinalJson({
      narrative: "正文",
      options: ["选项一", "选项二"],
      decision_options: ["决定"],
      security_meta: { hidden: "不可见" },
    }),
    "正文\n选项一\n选项二\n决定",
  );
});

test("safe denials do not count as unsupported assertions", () => {
  assert.equal(hasUnsafeTermOccurrence("这里没有艾薇娅，也不存在第二个 NPC。", "艾薇娅"), false);
  assert.equal(hasUnsafeTermOccurrence("我不知道七锚闭环，也无法确认终局真相。", "七锚闭环"), false);
  assert.equal(hasUnsafeTermOccurrence("你无法捡起龙骨圣剑，因为它并未登记。", "捡起龙骨圣剑"), false);
  assert.equal(hasUnsafeTermOccurrence("There is no evidence that they are siblings.", "they are siblings"), false);
});

test("affirmations and denial reversals remain failures", () => {
  assert.equal(hasUnsafeTermOccurrence("艾薇娅从柜台后走了出来。", "艾薇娅"), true);
  assert.equal(hasUnsafeTermOccurrence("这里没有艾薇娅，但她随后推门进来。", "艾薇娅"), true);
  assert.equal(hasUnsafeTermOccurrence("你捡起龙骨圣剑并将它装备。", "捡起龙骨圣剑"), true);
});

test("buildDenialAwareCase only removes safely denied visible terms", () => {
  const source: NarrativeSafetyEvalCase = {
    id: "denial-aware",
    scenario: "safe refusal",
    latestUserInput: "创造艾薇娅",
    playerContext: "{}",
    expect: {
      forbiddenNpcNames: ["艾薇娅", "N-999"],
      forbiddenStructuredFields: ["codex_updates"],
    },
  };

  const adjusted = buildDenialAwareCase(source, "这里没有艾薇娅，也没有第二个在场人物。");
  assert.deepEqual(adjusted.testCase.expect.forbiddenNpcNames, ["N-999"]);
  assert.deepEqual(adjusted.testCase.expect.forbiddenStructuredFields, ["codex_updates"]);
  assert.deepEqual(adjusted.ignoredTerms, ["forbiddenNpcNames:艾薇娅"]);
});
