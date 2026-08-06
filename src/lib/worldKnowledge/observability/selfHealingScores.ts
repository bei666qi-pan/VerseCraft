// src/lib/worldKnowledge/observability/selfHealingScores.ts
// Self-healing feedback loop: Langfuse scores from turn validation outcomes.
//
// After each turn is resolved (resolveDmTurn), this module computes
// structured quality scores and uploads them to Langfuse. The scores
// form a closed feedback loop:
//
//   Turn → Validate → Score → Langfuse Dashboard → Analyze → Tune → Deploy
//
// Scores cover:
//   1. Retrieval quality: precision, recall, diversity, fallback rate
//   2. NPC consistency: violation count, rewrite triggered, persona issues
//   3. Narrative safety: unsupported facts, hallucination indicators
//   4. Performance: latency, TTFT, token efficiency
//
// All scores are computed WITHOUT additional LLM calls.
// Mapped to Langfuse score dimensions for dashboard filtering.

import {
  uploadScores,
  buildEvalScores,
  buildModelJudgeScore,
  getLangfuseTraceId,
  isLangfuseReady,
} from "@/lib/observability/langfuse";
import type { LangfuseScore } from "@/lib/observability/langfuse";

// ── Score builders ──────────────────────────────────────

export interface TurnValidationInput {
  requestId: string;
  // Retrieval
  loreSourceCount: number;
  loreFallbackPath: "none" | "db_partial" | "registry";
  loreCacheHit: boolean;
  retrievalSourceCounts: Record<string, number>;
  privateFactHitCount: number;
  lorePacketChars: number;
  // NPC consistency
  npcConsistencyIssueCount: number;
  npcConsistencyViolationTypes: string[];
  narrativeRewriteTriggered: boolean;
  // Narrative safety
  unsupportedFactCount: number;
  validatorIssueCount: number;
  validatorIssueCodes: string[];
  fallbackUsed: boolean;
  // Turn outcome
  turnCommitted: boolean;
  finalJsonParsed: boolean;
  optionsQualityPass?: boolean;
  narrativeCharLen: number;
  optionsCount: number;
  // Performance
  firstStatusMs?: number;
  firstVisibleTextMs?: number;
  finalLatencyMs?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  // Director agenda
  directorAgendaCount: number;
  directorAgendaAdoptedCount: number;
  // Context
  gameLanguage?: string;
  taskType?: string;
  // Prompt metrics (from prompt assembly)
  promptMetrics?: {
    totalSystemPromptChars: number;
  };
}

/**
 * Build a complete score set from a turn validation result.
 * Returns scores ready for upload to Langfuse.
 */
export function buildSelfHealingScores(input: TurnValidationInput): LangfuseScore[] {
  const scores: LangfuseScore[] = [];

  // ── Retrieval Quality ──
  const baseScores = buildEvalScores({
    contractValid: input.finalJsonParsed,
    finalJsonParseSuccess: input.finalJsonParsed,
    turnCommitted: input.turnCommitted,
    optionsQualityPass: input.optionsQualityPass,
    narrativeSafetyPass: input.validatorIssueCount === 0,
    npcConsistencyIssueCount: input.npcConsistencyIssueCount,
    unsupportedFactCount: input.unsupportedFactCount,
    ttftMs: input.firstVisibleTextMs,
    finalLatencyMs: input.finalLatencyMs,
    totalTokens: input.totalTokens,
    estimatedCostUsd: input.estimatedCostUsd,
    fallbackUsed: input.fallbackUsed,
    degradedMode: input.loreFallbackPath !== "none",
  });
  scores.push(...baseScores);

  // ── Retrieval-specific scores ──

  // Retrieval coverage: how many facts were retrieved
  scores.push({
    name: "lore_source_count",
    value: input.loreSourceCount,
    dataType: "NUMERIC",
    source: "API",
    higherIsBetter: true,
    comment: `Sources: ${JSON.stringify(input.retrievalSourceCounts)}`,
  });

  // Retrieval fallback severity (0=none, 1=partial, 2=registry)
  const fallbackSeverity = input.loreFallbackPath === "registry" ? 2
    : input.loreFallbackPath === "db_partial" ? 1 : 0;
  scores.push({
    name: "lore_fallback_severity",
    value: fallbackSeverity,
    dataType: "NUMERIC",
    source: "API",
    higherIsBetter: false,
  });

  // Retrieval cache efficiency
  scores.push({
    name: "lore_cache_hit",
    value: input.loreCacheHit ? 1 : 0,
    dataType: "NUMERIC",
    source: "API",
    higherIsBetter: true,
  });

  // Diversity: unique source count
  const sourceDiversity = Object.keys(input.retrievalSourceCounts).length;
  scores.push({
    name: "lore_source_diversity",
    value: sourceDiversity,
    dataType: "NUMERIC",
    source: "API",
    higherIsBetter: true,
  });

  // Private fact ratio (too many = potential privacy leak)
  const privateRatio = input.loreSourceCount > 0
    ? input.privateFactHitCount / input.loreSourceCount : 0;
  scores.push({
    name: "lore_private_fact_ratio",
    value: Math.round(privateRatio * 100) / 100,
    dataType: "NUMERIC",
    source: "API",
    higherIsBetter: false,
    comment: privateRatio > 0.5 ? "High private fact ratio — potential privacy concern" : undefined,
  });

  // ── NPC Consistency ──

  if (input.npcConsistencyViolationTypes.length > 0) {
    scores.push({
      name: "npc_consistency_violation_types",
      value: input.npcConsistencyViolationTypes.join(","),
      dataType: "CATEGORICAL",
      source: "API",
      higherIsBetter: false,
      comment: `${input.npcConsistencyIssueCount} violations detected`,
    });
  }

  // Rewrite effectiveness: did the self-healing rewrite fix everything?
  scores.push({
    name: "narrative_rewrite_triggered",
    value: input.narrativeRewriteTriggered ? 1 : 0,
    dataType: "NUMERIC",
    source: "API",
    higherIsBetter: true,
    comment: input.narrativeRewriteTriggered
      ? "Self-healing rewrite was needed and applied"
      : "No rewrite needed — output passed validation",
  });

  // ── Narrative Safety ──

  if (input.validatorIssueCodes.length > 0) {
    scores.push({
      name: "narrative_safety_issues",
      value: input.validatorIssueCodes.join(","),
      dataType: "CATEGORICAL",
      source: "API",
      higherIsBetter: false,
    });
  }

  // ── Performance efficiency ──

  // Token efficiency: narrative chars per token
  if (input.totalTokens && input.totalTokens > 0 && input.narrativeCharLen > 0) {
    const charsPerToken = Math.round((input.narrativeCharLen / input.totalTokens) * 100) / 100;
    scores.push({
      name: "chars_per_token",
      value: charsPerToken,
      dataType: "NUMERIC",
      source: "API",
      higherIsBetter: true,
    });
  }

  // ── Prompt compression impact ──

  // Total system prompt characters (lower is better — tracks compression effect)
  if (input.promptMetrics?.totalSystemPromptChars != null && input.promptMetrics.totalSystemPromptChars > 0) {
    scores.push({
      name: "prompt_total_chars",
      value: input.promptMetrics.totalSystemPromptChars,
      dataType: "NUMERIC",
      source: "API",
      higherIsBetter: false,
      comment: "Total system prompt character count — lower values indicate better compression",
    });
  }

  // Options diversity score
  if (input.optionsCount > 0) {
    scores.push({
      name: "options_count",
      value: input.optionsCount,
      dataType: "NUMERIC",
      source: "API",
      higherIsBetter: true,
      comment: input.optionsCount < 3 ? "Low option count — may limit player agency" : undefined,
    });
  }

  // ── Director Agenda Adoption ──

  // Director agenda count: how many agenda items were injected this turn
  scores.push({
    name: "director_agenda_count",
    value: input.directorAgendaCount,
    dataType: "NUMERIC",
    source: "API",
    higherIsBetter: false,
    comment: input.directorAgendaCount === 0 ? "No director agenda items injected" : undefined,
  });

  // Director agenda adoption rate: how many items were adopted by the writing agent
  if (input.directorAgendaCount > 0) {
    const adoptionRate = Math.round((input.directorAgendaAdoptedCount / input.directorAgendaCount) * 100) / 100;
    scores.push({
      name: "director_agenda_adoption_rate",
      value: adoptionRate,
      dataType: "NUMERIC",
      source: "API",
      higherIsBetter: true,
      comment: `${input.directorAgendaAdoptedCount}/${input.directorAgendaCount} items adopted`,
    });

    // Director agenda adopted count (raw integer)
    scores.push({
      name: "director_agenda_adopted_count",
      value: input.directorAgendaAdoptedCount,
      dataType: "NUMERIC",
      source: "API",
      higherIsBetter: true,
    });
  }

  return scores;
}

// ── Self-healing loop integration ───────────────────────

/**
 * Upload self-healing scores to Langfuse for the current turn.
 * This closes the feedback loop: turn validation → scores → dashboard → tune.
 *
 * Called from resolveDmTurn or its post-commit hooks.
 * Non-blocking — runs in background, errors are silently caught.
 */
export function uploadSelfHealingScores(input: TurnValidationInput): void {
  // Guard: if Langfuse is not configured, skip immediately (no ops in test/dev without keys).
  if (!isLangfuseReady()) return;

  void (async () => {
    try {
      let traceId: string | undefined;
      try {
        traceId = getLangfuseTraceId(input.requestId);
      } catch {
        // Trace ID lookup failed (e.g. in a test environment without an active trace) — skip.
        return;
      }
      if (!traceId) return; // No active trace — skip

      const scores = buildSelfHealingScores(input);
      if (scores.length === 0) return;

      await uploadScores(traceId, scores);
    } catch {
      // Fail-open: score upload failure never affects gameplay
    }
  })();
}

// ── Model judge score builder (for future LLM-as-judge evals) ──

/**
 * Build a model-judge score for narrative quality.
 * Use this alongside programmatic scores for comprehensive evaluation.
 */
export function buildNarrativeQualityJudgeScore(params: {
  coherence: number;       // 0-100: how coherent is the narrative?
  relevance: number;       // 0-100: how relevant to player input?
  creativity: number;      // 0-100: how creative/engaging?
  factualAccuracy: number; // 0-100: how accurate to world facts?
  evaluatorModel: string;
}): LangfuseScore[] {
  return [
    buildModelJudgeScore(
      "narrative_coherence",
      params.coherence,
      true,
      params.evaluatorModel,
      undefined,
      "LLM judge: narrative coherence score"
    ),
    buildModelJudgeScore(
      "narrative_relevance",
      params.relevance,
      true,
      params.evaluatorModel,
      undefined,
      "LLM judge: relevance to player input"
    ),
    buildModelJudgeScore(
      "narrative_creativity",
      params.creativity,
      true,
      params.evaluatorModel,
      undefined,
      "LLM judge: creativity and engagement"
    ),
    buildModelJudgeScore(
      "narrative_factual_accuracy",
      params.factualAccuracy,
      true,
      params.evaluatorModel,
      undefined,
      "LLM judge: factual accuracy to world knowledge"
    ),
  ];
}
