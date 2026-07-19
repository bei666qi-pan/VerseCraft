import assert from "node:assert/strict";
import test from "node:test";
import type { AIResponse } from "@/lib/ai/types";
import {
  buildModelNarrativeReviewPrompt,
  parseModelNarrativeReviewVerdict,
  reviewModelNarrative,
  summarizeModelNarrativeReviews,
  type ModelNarrativeReviewTarget,
} from "./modelNarrativeReview";

const target: ModelNarrativeReviewTarget = {
  caseId: "hallucinated-key-review",
  scenario: "玩家仅持有手机，在三楼走廊调查。",
  permittedFacts: [{ id: "phone", text: "玩家持有手机" }],
  steps: [{
    stepIndex: 0,
    playerAction: "查看口袋里的物品",
    narrative: "你掏出一把从未获得过的黄铜钥匙。",
    options: ["用钥匙开门"],
    dmJson: { is_action_legal: true, sanity_damage: 0, is_death: false, narrative: "你掏出一把从未获得过的黄铜钥匙。", options: ["用钥匙开门"] },
    stateBefore: { inventory: ["phone"] },
    stateAfter: { inventory: ["phone"] },
  }],
};

async function withEnv<T>(name: string, value: string | undefined, callback: () => T | Promise<T>): Promise<T> {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

function validVerdict(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    confidence: 0.92,
    dimensionScores: {
      fact_support: 1,
      epistemic_boundary: 5,
      state_narrative_consistency: 1,
      option_executability: 1,
      player_agency: 3,
      readable_suspense: 3,
    },
    passed: false,
    reasoning: "钥匙不在允许事实或状态中。",
    issues: [{ dimension: "fact_support", severity: "critical", description: "凭空获得钥匙", stepIndex: 0, evidence: "掏出一把从未获得过的黄铜钥匙", factId: "phone" }],
    ...overrides,
  });
}

test("model review prompt includes only permitted facts and demands evidence", () => {
  const prompt = buildModelNarrativeReviewPrompt(target);
  assert.match(prompt.system, /请严格以 JSON 格式输出/);
  assert.match(prompt.user, /玩家持有手机/);
  assert.match(prompt.system, /stepIndex/);
  assert.match(prompt.system, /__unsupported_fact__/);
  assert.match(prompt.system, /candidate_new_facts.*未提交/);
  assert.doesNotMatch(prompt.user, /公寓根因/);
});

test("model review prompt marks actually applied partial regenerated choices as client-visible", () => {
  const regenerated: ModelNarrativeReviewTarget = {
    ...target,
    steps: [{
      ...target.steps[0]!,
      options: ["检查门缝", "沿走廊撤退"],
      optionsSource: "client_regenerated",
      clientOptionRegeneration: { source: "api_chat_options_regen_only", attempted: true, applied: true, complete: false, options: ["检查门缝", "沿走廊撤退"] },
    }],
  };
  const prompt = buildModelNarrativeReviewPrompt(regenerated);
  assert.match(prompt.user, /client_regenerated/);
  assert.match(prompt.user, /检查门缝/);
});

test("parser accepts supported hallucination finding", () => {
  const verdict = parseModelNarrativeReviewVerdict(validVerdict());
  assert.ok(verdict);
  assert.equal(verdict.issues[0]?.severity, "critical");
  assert.equal(verdict.issues[0]?.evidence, "掏出一把从未获得过的黄铜钥匙");
});

test("parser rejects critical finding without player-visible evidence", () => {
  const verdict = parseModelNarrativeReviewVerdict(validVerdict({
    issues: [{ dimension: "fact_support", severity: "critical", description: "凭空获得钥匙", factId: "phone" }],
  }));
  assert.equal(verdict, null);
});

test("parser rejects low-integrity JSON with missing score dimensions", () => {
  const verdict = parseModelNarrativeReviewVerdict(JSON.stringify({ confidence: 0.9, dimensionScores: { fact_support: 5 }, passed: true, reasoning: "ok", issues: [] }));
  assert.equal(verdict, null);
});

test("disabled flag does not call a model or invent a pass", async () => {
  await withEnv("VERSECRAFT_ENABLE_MODEL_NARRATIVE_REVIEW_EVALS", "0", async () => {
    const result = await reviewModelNarrative(target, {
      liveRequested: true,
      callJudge: async () => { throw new Error("must not call"); },
    });
    assert.equal(result.provenance, "not_run");
    assert.equal(result.reason, "feature_disabled");
  });
});

test("budget exhaustion is inconclusive, never an offline pass", async () => {
  await withEnv("VERSECRAFT_ENABLE_MODEL_NARRATIVE_REVIEW_EVALS", "1", async () => withEnv("VERSECRAFT_EVAL_DISABLE_CACHE", "1", async () => {
    const result = await reviewModelNarrative(target, { liveRequested: true, consumeBudget: () => false });
    assert.equal(result.provenance, "inconclusive");
    assert.equal(result.reason, "budget_exhausted");
  }));
});

test("gateway failure is inconclusive, never an offline pass", async () => {
  await withEnv("VERSECRAFT_ENABLE_MODEL_NARRATIVE_REVIEW_EVALS", "1", async () => withEnv("VERSECRAFT_EVAL_DISABLE_CACHE", "1", async () => {
    const result = await reviewModelNarrative(target, {
      liveRequested: true,
      consumeBudget: () => true,
      callJudge: async () => ({ ok: false, code: "CHAIN_EXHAUSTED", message: "gateway unavailable" }),
    });
    assert.equal(result.provenance, "inconclusive");
    assert.equal(result.reason, "gateway_error");
  }));
});

test("low-confidence live result is inconclusive", async () => {
  await withEnv("VERSECRAFT_ENABLE_MODEL_NARRATIVE_REVIEW_EVALS", "1", async () => withEnv("VERSECRAFT_EVAL_DISABLE_CACHE", "1", async () => {
    const response: AIResponse = { ok: true, providerId: "oneapi", logicalRole: "control", content: validVerdict({ confidence: 0.2 }), usage: null, latencyMs: 1 };
    const result = await reviewModelNarrative(target, { liveRequested: true, consumeBudget: () => true, callJudge: async () => response });
    assert.equal(result.provenance, "inconclusive");
    assert.equal(result.reason, "low_confidence");
  }));
});

test("strict summary fails on a supported critical issue and incomplete coverage", () => {
  const reviewed = {
    caseId: target.caseId,
    contentHash: "hash",
    rubricVersion: "model-narrative-review-v1" as const,
    provenance: "live_model" as const,
    logicalTask: "EVAL_JUDGE" as const,
    cacheHit: false,
    verdict: parseModelNarrativeReviewVerdict(validVerdict())!,
  };
  const summary = summarizeModelNarrativeReviews([reviewed, { ...reviewed, caseId: "missing", provenance: "inconclusive" as const, verdict: undefined, reason: "gateway_error" as const }], 1);
  assert.equal(summary.liveCoverage, 0.5);
  assert.equal(summary.strictGatePass, false);
});
