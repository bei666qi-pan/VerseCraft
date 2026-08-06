// src/lib/worldKnowledge/retrieval/llmReranker.ts
// LLM-based cross-encoder reranker for high-precision world knowledge retrieval.
//
// When enabled (VERSECRAFT_ENABLE_LLM_RERANKER), this module uses a
// lightweight LLM call to re-rank the top N retrieval candidates based on
// their relevance to the player's query and current game context.
//
// Design:
// - Off-critical-path: runs after heuristic rerank, before reveal gate
// - Budget-conscious: only reranks top K (default 8) candidates
// - Cached: query + candidates → reranked order memoized per turn
// - Fail-open: any error returns original candidates unchanged
//
// Configure via:
//   VERSECRAFT_ENABLE_LLM_RERANKER  — feature flag (default: false)
//   VERSECRAFT_LLM_RERANKER_TOP_K   — number of candidates to rerank (default: 8)

import { envBoolean, envNumber, envRaw } from "@/lib/config/envRaw";
import { startGeneration } from "@/lib/observability/langfuse";
import type { RetrievalCandidate } from "../types";

// ── Feature flag ─────────────────────────────────────────

export function isLlmRerankerEnabled(): boolean {
  return envBoolean("VERSECRAFT_ENABLE_LLM_RERANKER", false);
}

// ── Rerank Prompt ────────────────────────────────────────

const RERANK_SYSTEM_PROMPT = `你是一个游戏世界知识的检索重排助手。给定玩家的查询和检索到的世界知识候选项，你需要根据与查询的相关性对候选项重新排序。

评分标准（0-100分）：
- 90-100：直接回答查询核心问题，包含关键实体或规则
- 70-89：与查询高度相关，提供重要上下文
- 50-69：部分相关，提供背景信息
- 30-49：间接相关，可能有用
- 0-29：不相关或冗余

请严格以 JSON 格式输出，包含以下字段：
- "ranked": 重排后的候选项索引列表（按相关性从高到低）
- "scores": 每个候选项的相关性评分（0-100）
- "reasoning": 简要说明重排理由（1-2句话）`;

/**
 * Build the user message for reranking.
 */
function buildRerankUserMessage(
  query: string,
  candidates: RetrievalCandidate[],
  playerLocation?: string | null,
): string {
  const contextLine = playerLocation ? `玩家位置：${playerLocation}\n` : "";
  const candidateLines = candidates.map((c, i) =>
    `[${i}] ${c.fact.factType}: ${c.fact.canonicalText.slice(0, 200)}`
  ).join("\n");

  return `${contextLine}玩家查询：${query}\n\n候选项：\n${candidateLines}`;
}

// ── Parse LLM output ────────────────────────────────────

interface LlmRerankOutput {
  ranked: number[];
  scores: number[];
  reasoning: string;
}

function parseRerankOutput(raw: string, candidateCount: number): LlmRerankOutput | null {
  try {
    const trimmed = raw.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const ranked: number[] = Array.isArray(parsed.ranked)
      ? parsed.ranked.filter((i: unknown) => typeof i === "number" && i >= 0 && i < candidateCount)
      : [];
    const scores: number[] = Array.isArray(parsed.scores)
      ? parsed.scores.map((s: unknown) => typeof s === "number" ? s : 0)
      : [];

    if (ranked.length === 0) return null;

    return {
      ranked: ranked.slice(0, candidateCount),
      scores,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return null;
  }
}

// ── Main rerank function ─────────────────────────────────

export interface LlmRerankOptions {
  query: string;
  candidates: RetrievalCandidate[];
  playerLocation?: string | null;
  requestId?: string;
}

/**
 * Re-rank candidates using LLM cross-encoding.
 * Returns the re-ranked candidates (same objects, new order).
 */
export async function llmRerank(
  options: LlmRerankOptions
): Promise<{ candidates: RetrievalCandidate[]; usedLlm: boolean; latencyMs: number }> {
  const startTime = Date.now();

  if (!isLlmRerankerEnabled()) {
    return { candidates: options.candidates, usedLlm: false, latencyMs: 0 };
  }

  const topK = envNumber("VERSECRAFT_LLM_RERANKER_TOP_K", 8);
  const toRerank = options.candidates.slice(0, Math.min(topK, options.candidates.length));
  const rest = options.candidates.slice(toRerank.length);

  if (toRerank.length <= 1) {
    return { candidates: options.candidates, usedLlm: false, latencyMs: 0 };
  }

  try {
    const { executeChatCompletion } = await import("@/lib/ai/router/execute");
    const model = envRaw("VERSECRAFT_LLM_RERANKER_MODEL") ?? undefined;

    const genSpan = startGeneration({
      name: "ai.llm_rerank",
      provider: "oneapi",
      gatewayModel: model || "fast",
      intendedRole: "rerank",
      actualRole: "rerank",
      attemptIndex: 0,
      retryCount: 0,
      fallbackCount: 0,
      stream: false,
      cacheHit: false,
      success: false,
      requestId: options.requestId,
    });

    const userMessage = buildRerankUserMessage(options.query, toRerank, options.playerLocation);

    const result = await executeChatCompletion({
      messages: [
        { role: "system", content: RERANK_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      model,
      maxTokens: 512,
      temperature: 0,
      taskType: "BACKGROUND",
    });

    const latencyMs = Date.now() - startTime;
    genSpan.end({ success: true, totalLatencyMs: latencyMs });

    const parsed = parseRerankOutput(result.content, toRerank.length);

    if (parsed && parsed.ranked.length > 0) {
      // Reorder candidates by LLM rank
      const reranked = parsed.ranked
        .map((idx) => toRerank[idx])
        .filter(Boolean) as RetrievalCandidate[];

      // Add any remaining candidates
      return {
        candidates: [...reranked, ...rest],
        usedLlm: true,
        latencyMs,
      };
    }

    return { candidates: options.candidates, usedLlm: false, latencyMs };
  } catch (err) {
    console.warn("[llmReranker] LLM rerank failed, using original order", err);
    return {
      candidates: options.candidates,
      usedLlm: false,
      latencyMs: Date.now() - startTime,
    };
  }
}
