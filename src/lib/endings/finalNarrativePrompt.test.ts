import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEndingFinalChoices,
  buildEndingFinalNarrativePrompt,
  buildLocalEndingFinaleFallback,
  ENDING_SETTLEMENT_OPTIONS,
  normalizeEndingFinalePayload,
  stampEndingFinalChoice,
} from "./finalNarrativePrompt";

test("buildLocalEndingFinaleFallback creates a bounded final narrative with settlement options", () => {
  const choice = stampEndingFinalChoice(buildEndingFinalChoices({ outcome: "true_escape" })[0]!);
  const finale = buildLocalEndingFinaleFallback({
    outcome: "true_escape",
    choice,
    keyChoices: ["推开真正的门", "相信电梯里的刻痕"],
    obtainedClues: ["B2 门禁碎片"],
    worldStateLines: ["location:B2_GatekeeperDomain", "sanity:6"],
    lastNarrative: "门后很安静。",
  });

  assert.equal(finale.outcome, "true_escape");
  assert.equal(finale.source, "fallback");
  assert.ok(finale.narrative.length >= 600);
  assert.ok(finale.narrative.length <= 1000);
  assert.ok(finale.recalled.length >= 2);
  assert.deepEqual(finale.options, [...ENDING_SETTLEMENT_OPTIONS]);
});

test("normalizeEndingFinalePayload falls back when AI finale is incomplete", () => {
  const choice = stampEndingFinalChoice(buildEndingFinalChoices({ outcome: "doom" })[0]!);
  const finale = normalizeEndingFinalePayload(
    { outcome: "doom", narrative: "太短", recalled: ["x"], options: ["继续探索"] },
    {
      outcome: "doom",
      choice,
      keyChoices: ["第十日仍未离开"],
      obtainedClues: ["终焉刻度"],
      worldStateLines: ["time:day=10,hour=5"],
      lastNarrative: "",
    }
  );

  assert.equal(finale.source, "fallback");
  assert.equal(finale.outcome, "doom");
  assert.deepEqual(finale.options, [...ENDING_SETTLEMENT_OPTIONS]);
});

test("buildEndingFinalNarrativePrompt requires ending_finale protocol", () => {
  const choice = stampEndingFinalChoice(buildEndingFinalChoices({ outcome: "false_escape" })[0]!);
  const prompt = buildEndingFinalNarrativePrompt({
    outcome: "false_escape",
    choice,
    keyChoices: ["相信镜中出口"],
    obtainedClues: ["镜面规则"],
    worldStateLines: [],
    lastNarrative: "",
  });

  assert.match(prompt, /请严格以 JSON 格式输出/);
  assert.match(prompt, /ending_finale/);
  assert.match(prompt, /600到1000字/);
});
