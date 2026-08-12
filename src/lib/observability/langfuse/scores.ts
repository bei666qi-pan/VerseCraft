// src/lib/observability/langfuse/scores.ts
// Score upload adapter for existing eval suites.
// Maps VerseCraft eval dimensions to Langfuse scores.
import "server-only";

import type { LangfuseScore, ScoreSource } from "./types";
import { isLangfuseReady, getLangfuseConfig } from "./config";

/**
 * Upload a batch of scores to Langfuse.
 * Uses the @langfuse/client package (separate from tracing).
 * Failures are logged but never thrown.
 *
 * @param traceId — the trace to attach scores to
 * @param scores — scores to upload
 */
export async function uploadScores(
  traceId: string,
  scores: LangfuseScore[]
): Promise<{ uploaded: number; failed: number; skipped: boolean }> {
  if (!isLangfuseReady() || !scores.length) return { uploaded: 0, failed: 0, skipped: true };

  try {
    const { LangfuseClient } = await import("@langfuse/client");
    const cfg = getLangfuseConfig();

    const client = new LangfuseClient({
      publicKey: cfg.publicKey!,
      secretKey: cfg.secretKey!,
      baseUrl: cfg.baseUrl,
    });

    let uploaded = 0;
    let failed = 0;
    for (const score of scores) {
      try {
        client.score.create({
          traceId,
          name: score.name,
          value: score.value,
          dataType: score.dataType,
          comment: [score.source, score.evaluator, score.evaluatorVersion, score.comment].filter(Boolean).join(" | ") || undefined,
          ...(score.evaluator ? { observationId: undefined } : {}),
        });
        uploaded += 1;
      } catch (err) {
        failed += 1;
        console.warn("[langfuse] score upload failed for", score.name,
          err instanceof Error ? err.message : String(err));
      }
    }
    await client.flush();
    await client.shutdown();
    return { uploaded, failed, skipped: false };
  } catch (err) {
    console.error("[langfuse] score batch upload failed",
      err instanceof Error ? err.message : String(err));
    return { uploaded: 0, failed: scores.length, skipped: false };
  }
}

/**
 * Map common VerseCraft eval dimensions to Langfuse scores.
 * Returns an array of scores ready for upload.
 */
export function buildEvalScores(params: {
  /** Whether the DM JSON contract was valid. */
  contractValid?: boolean;
  /** Whether final JSON parse succeeded. */
  finalJsonParseSuccess?: boolean;
  /** Whether the turn was committed. */
  turnCommitted?: boolean;
  /** Whether options quality passed. */
  optionsQualityPass?: boolean;
  /** Whether narrative safety checks passed. */
  narrativeSafetyPass?: boolean;
  /** Number of NPC consistency issues. */
  npcConsistencyIssueCount?: number;
  /** Number of unsupported facts found. */
  unsupportedFactCount?: number;
  /** Time to first token in ms. */
  ttftMs?: number;
  /** Final latency in ms. */
  finalLatencyMs?: number;
  /** Total tokens used. */
  totalTokens?: number;
  /** Estimated cost in USD. */
  estimatedCostUsd?: number;
  /** Whether fallback was used. */
  fallbackUsed?: boolean;
  /** Whether degraded mode was active. */
  degradedMode?: boolean;
  /** Source for model-judge scores. */
  judgeSource?: "mock" | "codex" | "live";
  /** Evaluator version. */
  evaluatorVersion?: string;
  /** Dataset or scenario ID. */
  datasetId?: string;
}): LangfuseScore[] {
  const scores: LangfuseScore[] = [];

  const ruleScore = (
    name: string,
    value: number | string,
    dataType: LangfuseScore["dataType"],
    higherIsBetter: boolean,
    comment?: string
  ) => {
    scores.push({
      name,
      value,
      dataType,
      source: "API",
      higherIsBetter,
      comment,
    });
  };

  if (params.contractValid !== undefined) {
    ruleScore("contract_valid", params.contractValid ? 1 : 0, "NUMERIC", true);
  }
  if (params.finalJsonParseSuccess !== undefined) {
    ruleScore("final_json_parse_success", params.finalJsonParseSuccess ? 1 : 0, "NUMERIC", true);
  }
  if (params.turnCommitted !== undefined) {
    ruleScore("turn_committed", params.turnCommitted ? 1 : 0, "NUMERIC", true);
  }
  if (params.optionsQualityPass !== undefined) {
    ruleScore("options_quality_pass", params.optionsQualityPass ? 1 : 0, "NUMERIC", true);
  }
  if (params.narrativeSafetyPass !== undefined) {
    ruleScore("narrative_safety_pass", params.narrativeSafetyPass ? 1 : 0, "NUMERIC", true);
  }
  if (params.npcConsistencyIssueCount !== undefined) {
    ruleScore("npc_consistency_issue_count", params.npcConsistencyIssueCount, "NUMERIC", false);
  }
  if (params.unsupportedFactCount !== undefined) {
    ruleScore("unsupported_fact_count", params.unsupportedFactCount, "NUMERIC", false);
  }
  if (params.ttftMs !== undefined) {
    ruleScore("ttft_ms", params.ttftMs, "NUMERIC", false);
  }
  if (params.finalLatencyMs !== undefined) {
    ruleScore("final_latency_ms", params.finalLatencyMs, "NUMERIC", false);
  }
  if (params.totalTokens !== undefined) {
    ruleScore("total_tokens", params.totalTokens, "NUMERIC", false);
  }
  if (params.estimatedCostUsd !== undefined) {
    ruleScore("estimated_cost_usd", Math.round(params.estimatedCostUsd * 1_000_000) / 1_000_000, "NUMERIC", false);
  }
  if (params.fallbackUsed !== undefined) {
    ruleScore("fallback_used", params.fallbackUsed ? 1 : 0, "NUMERIC", true);
  }
  if (params.degradedMode !== undefined) {
    ruleScore("degraded_mode", params.degradedMode ? 1 : 0, "NUMERIC", true);
  }

  return scores;
}

/**
 * Create a model-judge score. Model scores must clearly indicate their source.
 */
export function buildModelJudgeScore(
  name: string,
  value: number,
  higherIsBetter: boolean,
  evaluator: string,
  evaluatorVersion?: string,
  comment?: string
): LangfuseScore {
  return {
    name,
    value,
    dataType: "NUMERIC",
    source: "EVAL",
    evaluator,
    evaluatorVersion,
    higherIsBetter,
    comment,
  };
}

/**
 * Create a human annotation score.
 */
export function buildHumanScore(
  name: string,
  value: number,
  higherIsBetter: boolean,
  annotatorId: string,
  comment?: string
): LangfuseScore {
  return {
    name,
    value,
    dataType: "NUMERIC",
    source: "ANNOTATION",
    evaluator: annotatorId,
    higherIsBetter,
    comment,
  };
}
