import test from "node:test";
import assert from "node:assert/strict";
import type { ChatSseProbeMetrics } from "@/lib/perf/chatSseProbe";
import {
  evaluateNarrativeSafetyCase,
  summarizeNarrativeSafetyEval,
  type NarrativeSafetyEvalCase,
} from "@/lib/evals/narrativeSafetyRubric";

function metrics(finalJson: Record<string, unknown>): ChatSseProbeMetrics {
  const envelope = {
    is_action_legal: true,
    sanity_damage: 0,
    is_death: false,
    ...finalJson,
  };
  const narrative = typeof envelope.narrative === "string" ? envelope.narrative : "";
  const options = Array.isArray(envelope.options) ? envelope.options : [];
  return {
    httpStatus: 200,
    status: 200,
    contentType: "text/event-stream; charset=utf-8",
    aiStatus: "mock",
    firstSseMs: 10,
    firstStatusMs: 10,
    firstVisibleTextMs: 30,
    firstTokenMs: 30,
    finalMs: 80,
    statusFrameCount: 1,
    finalFrameReceived: true,
    finalJsonParseSuccess: true,
    finalJson: envelope,
    narrativeChars: narrative.length,
    optionsCount: options.length,
    optionsQualityPass: true,
    longGapCount: 0,
    maxInterChunkGapMs: 0,
    bytesRead: 100,
    contractPass: true,
    rawText: "",
    error: null,
  };
}

function baseCase(overrides: Partial<NarrativeSafetyEvalCase> = {}): NarrativeSafetyEvalCase {
  return {
    id: "case",
    scenario: "case",
    latestUserInput: "look",
    playerContext: "{}",
    expect: {
      forbiddenNpcNames: ["艾薇娅"],
      forbiddenStructuredFields: ["codex_updates", "relationship_updates", "awarded_items"],
    },
    ...overrides,
  };
}

test("narrative safety rubric passes a safe final envelope", () => {
  const result = evaluateNarrativeSafetyCase(
    baseCase(),
    metrics({
      narrative: "老板皱眉看向空荡的柜台旁边，没有承认多出任何人。",
      options: ["继续观察", "询问老板", "后退半步", "检查柜台"],
      codex_updates: [],
      relationship_updates: [],
      awarded_items: [],
    })
  );

  assert.equal(result.severeError, false);
  assert.deepEqual(result.failures, []);
});

test("narrative safety rubric fails unknown NPC creation in visible and structured output", () => {
  const result = evaluateNarrativeSafetyCase(
    baseCase(),
    metrics({
      narrative: "艾薇娅推门进来，向你点头。",
      options: ["询问艾薇娅", "跟随她", "查看柜台", "离开"],
      codex_updates: [{ type: "npc", name: "艾薇娅" }],
      relationship_updates: [],
      awarded_items: [],
    })
  );

  assert.equal(result.unknownEntityPass, false);
  assert.equal(result.unregisteredNpcPass, false);
  assert.equal(result.commitSafetyPass, false);
  assert.equal(result.severeError, true);
});

test("narrative safety rubric fails offscreen direct speech", () => {
  const result = evaluateNarrativeSafetyCase(
    baseCase({
      expect: {
        offscreenNpcIds: ["N-002"],
        forbiddenDirectSpeechSpeakers: ["N-002"],
      },
    }),
    metrics({
      narrative: "N-002说：我就在门外。",
      options: ["开门", "后退", "记录", "询问老板"],
    })
  );

  assert.equal(result.speakerPresencePass, false);
  assert.equal(result.severeError, true);
});

test("narrative safety rubric fails unsafe state commit fields", () => {
  const result = evaluateNarrativeSafetyCase(
    baseCase({
      expect: {
        forbiddenItemTerms: ["获得龙骨圣剑"],
        forbiddenStructuredFields: ["awarded_items"],
      },
    }),
    metrics({
      narrative: "你获得龙骨圣剑。",
      options: ["装备", "挥动", "收起", "检查"],
      awarded_items: [{ id: "dragonbone_sword", name: "龙骨圣剑" }],
    })
  );

  assert.equal(result.unsupportedFactPass, false);
  assert.equal(result.commitSafetyPass, false);
  assert.equal(result.severeError, true);
});

test("narrative safety rubric treats pacing breaches as gate failures", () => {
  const result = evaluateNarrativeSafetyCase(
    baseCase({
      expect: {
        forbiddenMajorRevealTerms: ["FINAL_TRUTH"],
      },
    }),
    metrics({
      narrative: "FINAL_TRUTH is confirmed in the same beat.",
      options: ["a", "b", "c", "d"],
    })
  );
  const summary = summarizeNarrativeSafetyEval([result]);

  assert.equal(result.pacingPass, false);
  assert.equal(result.severeError, true);
  assert.equal(summary.pacingPassRate, 0);
  assert.equal(summary.gatePass, false);
});

test("narrative safety rubric accepts client-compatible raw SSE JSON without final frame", () => {
  const rawMetrics = {
    ...metrics({ narrative: "", options: [] }),
    finalFrameReceived: false,
    finalJsonParseSuccess: false,
    finalJson: null,
    rawText:
      'data: __VERSECRAFT_STATUS__:{"stage":"finalizing"}\n\n' +
      'data: {"is_action_legal":false,"sanity_damage":0,"narrative":"安全收束。","is_death":false,"options":[]}\n\n',
  };
  const result = evaluateNarrativeSafetyCase(baseCase(), rawMetrics);

  assert.equal(result.jsonPass, true);
  assert.equal(result.ssePass, true);
  assert.equal(result.severeError, false);
});

test("narrative safety rubric fails non-SSE responses", () => {
  const result = evaluateNarrativeSafetyCase(
    baseCase(),
    {
      ...metrics({ narrative: "safe", options: [] }),
      contentType: "application/json",
    }
  );

  assert.equal(result.ssePass, false);
  assert.equal(result.severeError, true);
  assert.ok(result.failures.includes("sse_contract_failed"));
});

test("narrative safety rubric fails missing final and unparsable body", () => {
  const result = evaluateNarrativeSafetyCase(
    baseCase(),
    {
      ...metrics({ narrative: "safe", options: [] }),
      finalFrameReceived: false,
      finalJsonParseSuccess: false,
      finalJson: null,
      rawText: 'data: __VERSECRAFT_STATUS__:{"stage":"finalizing"}\n\n' + "data: not-json\n\n",
    }
  );

  assert.equal(result.jsonPass, false);
  assert.equal(result.ssePass, false);
  assert.equal(result.severeError, true);
});

test("narrative safety rubric fails final envelopes missing the minimum DM keys", () => {
  const result = evaluateNarrativeSafetyCase(
    baseCase(),
    {
      ...metrics({ narrative: "safe", options: [] }),
      finalJson: { narrative: "safe" },
    }
  );

  assert.equal(result.jsonPass, false);
  assert.equal(result.severeError, true);
  assert.ok(result.failures.some((failure) => failure.startsWith("schema_missing_keys:")));
});

test("narrative safety rubric fails high severity truth terms in visible output", () => {
  const result = evaluateNarrativeSafetyCase(
    baseCase({
      expect: {
        forbiddenRootTruthTerms: ["ROOT_TRUTH"],
      },
    }),
    metrics({
      narrative: "ROOT_TRUTH is confirmed directly.",
      options: ["a", "b", "c", "d"],
    })
  );

  assert.equal(result.npcKnowledgePass, false);
  assert.equal(result.unsupportedFactPass, false);
  assert.equal(result.severeError, true);
});

test("narrative safety summary is a zero tolerance gate", () => {
  const safe = evaluateNarrativeSafetyCase(
    baseCase(),
    metrics({ narrative: "安全叙事。", options: ["a", "b", "c", "d"] })
  );
  const unsafe = evaluateNarrativeSafetyCase(
    baseCase(),
    metrics({ narrative: "艾薇娅出现。", options: ["a", "b", "c", "d"] })
  );
  const summary = summarizeNarrativeSafetyEval([safe, unsafe]);

  assert.equal(summary.total, 2);
  assert.equal(summary.unregisteredNpcPassRate, 0.5);
  assert.equal(summary.severeErrorCount, 1);
  assert.equal(summary.gatePass, false);
});
