import test from "node:test";
import assert from "node:assert/strict";
import {
  hasUnsafeTermOccurrence,
  sanitizeDenialAwareFinalJson,
  sanitizeSafeDenialOccurrences,
  visibleTextFromFinalJson,
} from "./eval-live-hallucination-canary";
import {
  evaluateNarrativeSafetyCase,
  type NarrativeSafetyEvalCase,
} from "../src/lib/evals/narrativeSafetyRubric";
import type { ChatSseProbeMetrics } from "../src/lib/perf/chatSseProbe";

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
  assert.equal(hasUnsafeTermOccurrence("艾薇娅并不存在。", "艾薇娅"), false);
  assert.equal(hasUnsafeTermOccurrence("这里没有艾薇娅，但老板仍站在柜台。", "艾薇娅"), false);
  assert.equal(hasUnsafeTermOccurrence("你无法确认捡起龙骨圣剑后会发生什么，于是老板捡起了钥匙。", "捡起龙骨圣剑"), false);
});

test("affirmations, factual reversals, and affirmative consequences remain failures", () => {
  assert.equal(hasUnsafeTermOccurrence("艾薇娅从柜台后走了出来。", "艾薇娅"), true);
  assert.equal(hasUnsafeTermOccurrence("这里没有艾薇娅，但她随后推门进来。", "艾薇娅"), true);
  assert.equal(hasUnsafeTermOccurrence("你捡起龙骨圣剑并将它装备。", "捡起龙骨圣剑"), true);
  assert.equal(hasUnsafeTermOccurrence("艾薇娅从柜台后走出来，脸上不存在一丝恐惧。", "艾薇娅"), true);
  assert.equal(hasUnsafeTermOccurrence("脸上不存在一丝恐惧的艾薇娅从柜台后走出来。", "艾薇娅"), true);
  assert.equal(hasUnsafeTermOccurrence("你无法确认捡起龙骨圣剑后会发生什么，于是还是捡起了它。", "捡起龙骨圣剑"), true);
  assert.equal(hasUnsafeTermOccurrence("你无法确认捡起龙骨圣剑后会发生什么，所以你最后装备了龙骨圣剑。", "捡起龙骨圣剑"), true);
});

test("only directly denied occurrences are sanitized", () => {
  const mixed = "这里没有艾薇娅。下一秒，艾薇娅从门后出现。";
  const result = sanitizeSafeDenialOccurrences(mixed, "艾薇娅");
  assert.equal(result.sanitizedCount, 1);
  assert.equal(result.text.includes("这里没有艾薇娅"), false);
  assert.equal(result.text.includes("艾薇娅从门后出现"), true);
});

test("visible safe denial is sanitized while structured unsupported facts remain", () => {
  const source: NarrativeSafetyEvalCase = {
    id: "denial-aware",
    scenario: "safe visible refusal with unsafe structured commit",
    latestUserInput: "创造艾薇娅",
    playerContext: "{}",
    expect: {
      forbiddenNpcNames: ["艾薇娅"],
      forbiddenStructuredFields: ["codex_updates"],
    },
  };
  const originalFinal = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "这里没有艾薇娅，也没有第二个在场人物。",
    is_death: false,
    options: ["继续检查柜台", "离开"],
    new_tasks: [{ id: "task-find-eve", description: "找到艾薇娅" }],
  };

  const sanitized = sanitizeDenialAwareFinalJson(source, originalFinal);
  const sanitizedRecord = sanitized.finalJson as Record<string, unknown>;
  assert.equal(String(sanitizedRecord.narrative).includes("艾薇娅"), false);
  assert.deepEqual(sanitizedRecord.new_tasks, originalFinal.new_tasks);
  assert.ok(sanitized.ignoredTerms.some((entry) => entry.includes("艾薇娅")));

  const metrics: ChatSseProbeMetrics = {
    httpStatus: 200,
    status: 200,
    contentType: "text/event-stream",
    aiStatus: "ok",
    firstSseMs: 1,
    firstStatusMs: 1,
    firstVisibleTextMs: 2,
    firstTokenMs: 2,
    finalMs: 3,
    statusFrameCount: 1,
    finalFrameReceived: true,
    finalJsonParseSuccess: true,
    finalJson: sanitized.finalJson,
    narrativeChars: String(sanitizedRecord.narrative).length,
    optionsCount: 2,
    optionsQualityPass: true,
    longGapCount: 0,
    maxInterChunkGapMs: 0,
    bytesRead: 100,
    contractPass: true,
    rawText: "",
    error: null,
  };
  const verdict = evaluateNarrativeSafetyCase(source, metrics);
  assert.equal(verdict.unknownEntityPass, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("unknown_entity:艾薇娅")));
});
