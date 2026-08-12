import assert from "node:assert/strict";
import test from "node:test";
import { compareRagasBaseline, contextPrecision, contextRecall, evaluateDeterministicRagasCase, summarizeRagasResults } from "./metrics";
import type { RagasCase } from "./types";

const testCase: RagasCase = {
  id: "dark-moon-location",
  question: "玩家当前在哪里？",
  answer: "玩家位于如月公寓一层走廊。",
  contexts: [
    { id: "location:1f", text: "玩家在如月公寓一层走廊醒来。" },
    { id: "noise:weather", text: "窗外正在下雨。" },
  ],
  referenceContextIds: ["location:1f", "rule:exit"],
  groundTruth: "如月公寓一层走廊。",
};

test("ragas-compatible precision and recall use context identities", () => {
  assert.equal(contextPrecision(testCase), 0.5);
  assert.equal(contextRecall(testCase), 0.5);
});

test("ragas-compatible strict result does not treat unavailable judges as pass", () => {
  const result = evaluateDeterministicRagasCase(testCase);
  assert.equal(result.pass, false);
  assert.equal(result.metrics.filter((metric) => metric.status === "unavailable").length, 2);
  assert.equal(summarizeRagasResults([result]).gatePass, false);
});

test("ragas-compatible case passes when all versioned metrics clear thresholds", () => {
  const completeCase = { ...testCase, contexts: [{ id: "location:1f", text: "位置" }, { id: "rule:exit", text: "出口规则" }] };
  const result = evaluateDeterministicRagasCase(completeCase, [
    { name: "faithfulness", value: 0.95, status: "ok", method: "model_judge" },
    { name: "answer_relevancy", value: 0.9, status: "ok", method: "model_judge" },
  ]);
  assert.equal(result.pass, true);
});

test("ragas-compatible baseline comparison reports regressions without mutating cases", () => {
  const result = evaluateDeterministicRagasCase(testCase);
  const comparison = compareRagasBaseline(summarizeRagasResults([result]), {
    version: "baseline-v1",
    tolerance: 0.05,
    averages: { context_precision: 0.7, context_recall: 0.4 },
  });
  assert.deepEqual(comparison.regressions, ["context_precision"]);
  assert.equal(comparison.deltas.context_recall, 0.1);
  assert.equal(testCase.contexts.length, 2);
});
