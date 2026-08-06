// src/lib/worldKnowledge/observability/selfHealingScores.test.ts
// Tests for selfHealingScores: score builders and upload integration.
import { describe, it, expect, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────
// server-only throws outside Next.js bundler — mock as no-op.
vi.mock("server-only", () => ({}));

// Mock uploadScores and getLangfuseTraceId (side-effect functions).
// buildEvalScores and buildModelJudgeScore are used unmocked so the
// test exercises the real integration.

vi.mock("@/lib/observability/langfuse", async () => {
  const actual = await vi.importActual<typeof import("@/lib/observability/langfuse")>(
    "@/lib/observability/langfuse"
  );
  return {
    ...actual,
    uploadScores: vi.fn(),
    getLangfuseTraceId: vi.fn().mockReturnValue(null),
  };
});

import {
  buildSelfHealingScores,
  buildNarrativeQualityJudgeScore,
  uploadSelfHealingScores,
  type TurnValidationInput,
} from "./selfHealingScores";

// ── Helpers ──────────────────────────────────────────────────

function makeFullInput(overrides?: Partial<TurnValidationInput>): TurnValidationInput {
  return {
    requestId: "req-full-001",
    loreSourceCount: 12,
    loreFallbackPath: "none",
    loreCacheHit: true,
    retrievalSourceCounts: { lore_db: 8, registry: 3, npc_memory: 1 },
    privateFactHitCount: 2,
    lorePacketChars: 4500,
    npcConsistencyIssueCount: 0,
    npcConsistencyViolationTypes: [],
    narrativeRewriteTriggered: false,
    unsupportedFactCount: 0,
    validatorIssueCount: 0,
    validatorIssueCodes: [],
    fallbackUsed: false,
    turnCommitted: true,
    finalJsonParsed: true,
    optionsQualityPass: true,
    narrativeCharLen: 3200,
    optionsCount: 4,
    firstStatusMs: 120,
    firstVisibleTextMs: 1800,
    finalLatencyMs: 8500,
    totalTokens: 4200,
    estimatedCostUsd: 0.012,
    directorAgendaCount: 3,
    directorAgendaAdoptedCount: 2,
    gameLanguage: "zh-CN",
    taskType: "PLAYER_CHAT",
    promptMetrics: { totalSystemPromptChars: 28000 },
    ...overrides,
  };
}

function makeMinimalInput(): TurnValidationInput {
  return {
    requestId: "req-min-001",
    loreSourceCount: 0,
    loreFallbackPath: "none",
    loreCacheHit: false,
    retrievalSourceCounts: {},
    privateFactHitCount: 0,
    lorePacketChars: 0,
    npcConsistencyIssueCount: 0,
    npcConsistencyViolationTypes: [],
    narrativeRewriteTriggered: false,
    unsupportedFactCount: 0,
    validatorIssueCount: 0,
    validatorIssueCodes: [],
    fallbackUsed: false,
    turnCommitted: false,
    finalJsonParsed: false,
    narrativeCharLen: 0,
    optionsCount: 0,
    directorAgendaCount: 0,
    directorAgendaAdoptedCount: 0,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("buildSelfHealingScores", () => {
  it("generates all score categories from a full input", () => {
    const input = makeFullInput();
    const scores = buildSelfHealingScores(input);

    // Should produce many scores across all categories
    expect(scores.length).toBeGreaterThan(10);

    // ── Base eval scores (from buildEvalScores) ──
    expect(findScore(scores, "contract_valid")?.value).toBe(1);
    expect(findScore(scores, "final_json_parse_success")?.value).toBe(1);
    expect(findScore(scores, "turn_committed")?.value).toBe(1);
    expect(findScore(scores, "options_quality_pass")?.value).toBe(1);
    expect(findScore(scores, "narrative_safety_pass")?.value).toBe(1);
    expect(findScore(scores, "npc_consistency_issue_count")?.value).toBe(0);
    expect(findScore(scores, "unsupported_fact_count")?.value).toBe(0);

    // ── Retrieval-specific scores ──
    expect(findScore(scores, "lore_source_count")?.value).toBe(12);
    expect(findScore(scores, "lore_fallback_severity")?.value).toBe(0);
    expect(findScore(scores, "lore_cache_hit")?.value).toBe(1);
    expect(findScore(scores, "lore_source_diversity")?.value).toBe(3);
    expect(findScore(scores, "lore_private_fact_ratio")?.value).toBeCloseTo(0.17);

    // ── Narrative rewrite ──
    expect(findScore(scores, "narrative_rewrite_triggered")?.value).toBe(0);

    // ── Performance ──
    expect(findScore(scores, "chars_per_token")).toBeDefined();
    expect(findScore(scores, "options_count")?.value).toBe(4);

    // ── Director agenda ──
    expect(findScore(scores, "director_agenda_count")?.value).toBe(3);
    expect(findScore(scores, "director_agenda_adoption_rate")?.value).toBeCloseTo(0.67);
    expect(findScore(scores, "director_agenda_adopted_count")?.value).toBe(2);

    // ── Prompt compression ──
    const promptChars = findScore(scores, "prompt_total_chars");
    expect(promptChars).toBeDefined();
    expect(promptChars!.value).toBe(28000);
    expect(promptChars!.higherIsBetter).toBe(false);
    expect(promptChars!.dataType).toBe("NUMERIC");
  });

  it("generates minimal scores from empty input", () => {
    const input = makeMinimalInput();
    const scores = buildSelfHealingScores(input);

    // Even minimal input should produce base eval scores (false still
    // generates scores because buildEvalScores checks !== undefined)
    expect(scores.length).toBeGreaterThan(0);
    expect(findScore(scores, "contract_valid")?.value).toBe(0);
    expect(findScore(scores, "turn_committed")?.value).toBe(0);
    expect(findScore(scores, "final_json_parse_success")?.value).toBe(0);

    // Retrieval scores with zero values
    expect(findScore(scores, "lore_source_count")?.value).toBe(0);
    expect(findScore(scores, "lore_fallback_severity")?.value).toBe(0);
    expect(findScore(scores, "lore_cache_hit")?.value).toBe(0);
    expect(findScore(scores, "lore_source_diversity")?.value).toBe(0);
    expect(findScore(scores, "lore_private_fact_ratio")?.value).toBe(0);

    // No violation categoricals when lists are empty
    expect(findScore(scores, "npc_consistency_violation_types")).toBeUndefined();
    expect(findScore(scores, "narrative_safety_issues")).toBeUndefined();

    // No chars_per_token when narrativeCharLen is 0
    expect(findScore(scores, "chars_per_token")).toBeUndefined();

    // No options_count when optionsCount is 0
    expect(findScore(scores, "options_count")).toBeUndefined();

    // Director agenda with zero count — still emitted
    expect(findScore(scores, "director_agenda_count")?.value).toBe(0);
    // But adoption rate is omitted when agendaCount is 0
    expect(findScore(scores, "director_agenda_adoption_rate")).toBeUndefined();
    expect(findScore(scores, "director_agenda_adopted_count")).toBeUndefined();
  });

  it("generates correct scores for a fallback scenario", () => {
    const input = makeFullInput({
      fallbackUsed: true,
      loreFallbackPath: "registry",
      loreCacheHit: false,
      loreSourceCount: 3,
      retrievalSourceCounts: { registry: 3 },
      finalJsonParsed: true,
      turnCommitted: true,
    });
    const scores = buildSelfHealingScores(input);

    // fallback_used from base eval
    expect(findScore(scores, "fallback_used")?.value).toBe(1);

    // degraded_mode: true because loreFallbackPath !== "none"
    expect(findScore(scores, "degraded_mode")?.value).toBe(1);

    // fallback severity = 2 (registry)
    expect(findScore(scores, "lore_fallback_severity")?.value).toBe(2);

    // retrieval still reports what was fetched
    expect(findScore(scores, "lore_source_count")?.value).toBe(3);
    expect(findScore(scores, "lore_cache_hit")?.value).toBe(0);
    expect(findScore(scores, "lore_source_diversity")?.value).toBe(1);
  });

  it("generates NPC consistency violation scores", () => {
    const input = makeFullInput({
      npcConsistencyIssueCount: 3,
      npcConsistencyViolationTypes: ["wrong_knowledge", "persona_drift", "canon_name_mismatch"],
      narrativeRewriteTriggered: true,
    });
    const scores = buildSelfHealingScores(input);

    // Base eval should reflect the issue count
    expect(findScore(scores, "npc_consistency_issue_count")?.value).toBe(3);

    // Categorical violation types
    const violationScore = findScore(scores, "npc_consistency_violation_types");
    expect(violationScore).toBeDefined();
    expect(violationScore!.dataType).toBe("CATEGORICAL");
    expect(violationScore!.value).toBe("wrong_knowledge,persona_drift,canon_name_mismatch");
    expect(violationScore!.comment).toContain("3 violations detected");

    // Rewrite triggered = 1
    expect(findScore(scores, "narrative_rewrite_triggered")?.value).toBe(1);
  });

  it("includes narrative safety issue codes when present", () => {
    const input = makeFullInput({
      validatorIssueCount: 2,
      validatorIssueCodes: ["unsupported_fact", "hallucinated_name"],
    });
    const scores = buildSelfHealingScores(input);

    const safetyScore = findScore(scores, "narrative_safety_issues");
    expect(safetyScore).toBeDefined();
    expect(safetyScore!.dataType).toBe("CATEGORICAL");
    expect(safetyScore!.value).toBe("unsupported_fact,hallucinated_name");
  });

  it("omits narrative_safety_issues when validatorIssueCodes is empty", () => {
    const input = makeFullInput({ validatorIssueCodes: [] });
    const scores = buildSelfHealingScores(input);
    expect(findScore(scores, "narrative_safety_issues")).toBeUndefined();
  });

  it("sets high private fact ratio comment when ratio exceeds 0.5", () => {
    const input = makeFullInput({
      loreSourceCount: 10,
      privateFactHitCount: 8,
    });
    const scores = buildSelfHealingScores(input);

    const ratioScore = findScore(scores, "lore_private_fact_ratio");
    expect(ratioScore).toBeDefined();
    expect(ratioScore!.value).toBeCloseTo(0.8);
    expect(ratioScore!.comment).toContain("High private fact ratio");
  });

  it("omits director adoption scores when no agenda items", () => {
    const input = makeFullInput({
      directorAgendaCount: 0,
      directorAgendaAdoptedCount: 0,
    });
    const scores = buildSelfHealingScores(input);

    expect(findScore(scores, "director_agenda_count")?.value).toBe(0);
    expect(findScore(scores, "director_agenda_adoption_rate")).toBeUndefined();
    expect(findScore(scores, "director_agenda_adopted_count")).toBeUndefined();
  });

  it("omits prompt_total_chars when promptMetrics is not provided", () => {
    const input = makeFullInput({ promptMetrics: undefined });
    const scores = buildSelfHealingScores(input);
    expect(findScore(scores, "prompt_total_chars")).toBeUndefined();
  });

  it("omits prompt_total_chars when totalSystemPromptChars is zero", () => {
    const input = makeFullInput({ promptMetrics: { totalSystemPromptChars: 0 } });
    const scores = buildSelfHealingScores(input);
    expect(findScore(scores, "prompt_total_chars")).toBeUndefined();
  });
});

describe("buildNarrativeQualityJudgeScore", () => {
  it("returns four model-judge scores with expected shape", () => {
    const scores = buildNarrativeQualityJudgeScore({
      coherence: 85,
      relevance: 92,
      creativity: 78,
      factualAccuracy: 95,
      evaluatorModel: "gpt-4o-mini",
    });

    expect(scores).toHaveLength(4);

    const names = scores.map((s) => s.name);
    expect(names).toEqual([
      "narrative_coherence",
      "narrative_relevance",
      "narrative_creativity",
      "narrative_factual_accuracy",
    ]);

    for (const score of scores) {
      // All are model-judge scores from buildModelJudgeScore
      expect(score.source).toBe("EVAL");
      expect(score.dataType).toBe("NUMERIC");
      expect(score.evaluator).toBe("gpt-4o-mini");
      expect(score.higherIsBetter).toBe(true);
      expect(score.value).toBeGreaterThanOrEqual(0);
      expect(score.value).toBeLessThanOrEqual(100);
      expect(score.comment).toBeDefined();
    }

    expect(scores[0]!.value).toBe(85);
    expect(scores[0]!.comment).toContain("narrative coherence");

    expect(scores[1]!.value).toBe(92);
    expect(scores[1]!.comment).toContain("relevance");

    expect(scores[2]!.value).toBe(78);
    expect(scores[2]!.comment).toContain("creativity");

    expect(scores[3]!.value).toBe(95);
    expect(scores[3]!.comment).toContain("factual accuracy");
  });
});

describe("uploadSelfHealingScores", () => {
  it("does not throw when getLangfuseTraceId returns null", () => {
    // getLangfuseTraceId is mocked to return null → upload short-circuits
    expect(() => uploadSelfHealingScores(makeFullInput())).not.toThrow();
  });
});

// ── Utility ──────────────────────────────────────────────────

function findScore(
  scores: ReturnType<typeof buildSelfHealingScores>,
  name: string
) {
  return scores.find((s) => s.name === name);
}
