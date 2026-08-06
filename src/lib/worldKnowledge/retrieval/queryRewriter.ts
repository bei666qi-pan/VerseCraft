// src/lib/worldKnowledge/retrieval/queryRewriter.ts
// LLM-based query rewriting for world knowledge retrieval.
//
// When enabled (via VERSECRAFT_ENABLE_LLM_QUERY_REWRITE), this module
// uses a lightweight LLM call to reformulate the player's input into an
// optimized retrieval query. The rewritten query is used alongside the
// heuristic expansions from queryExpander.ts.
//
// Design principles:
// - Off-critical-path: runs in the slow lane, does not block retrieval
// - Heavily cached: query → rewritten query is memoized per session
// - Budget-conscious: uses the cheapest model, strict token limits
// - Fallback-safe: any failure returns the original input unchanged
//
// Configure via:
//   VERSECRAFT_ENABLE_LLM_QUERY_REWRITE — feature flag (default: false)
//   VERSECRAFT_QUERY_REWRITE_MODEL      — model override (default: fast model)

import { envBoolean, envRaw } from "@/lib/config/envRaw";
import { startGeneration } from "@/lib/observability/langfuse";

// ── Feature flag ─────────────────────────────────────────

export function isLlmQueryRewriteEnabled(): boolean {
  return envBoolean("VERSECRAFT_ENABLE_LLM_QUERY_REWRITE", false);
}

// ── In-memory LRU cache ─────────────────────────────────

const QUERY_REWRITE_CACHE = new Map<string, { rewritten: string; timestamp: number }>();
const MAX_CACHE_SIZE = 200;
const CACHE_TTL_MS = 120_000; // 2 minutes per query

function cacheKey(input: string, context: string): string {
  // Simple hash-like key: truncate input + context to avoid huge keys
  const inp = input.slice(0, 200).replace(/\s+/g, "");
  const ctx = context.slice(0, 100).replace(/\s+/g, "");
  return `${inp}|${ctx}`;
}

function getCached(key: string): string | null {
  const entry = QUERY_REWRITE_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    QUERY_REWRITE_CACHE.delete(key);
    return null;
  }
  return entry.rewritten;
}

function setCache(key: string, value: string): void {
  if (QUERY_REWRITE_CACHE.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const oldest = [...QUERY_REWRITE_CACHE.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    )[0];
    if (oldest) QUERY_REWRITE_CACHE.delete(oldest[0]);
  }
  QUERY_REWRITE_CACHE.set(key, { rewritten: value, timestamp: Date.now() });
}

// ── CJK Tokenization Enhancement ────────────────────────

/**
 * Enhanced CJK tokenizer with:
 * 1. Bigram + trigram segmentation (better phrase matching)
 * 2. Punctuation-aware boundary detection
 * 3. Named entity boundary preservation
 */
const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf\u{f900}-\u{faff}]+/gu;

const SENTENCE_BREAKS = /[。，！？；：、\n\r]/g;

// Common Chinese particles and function words to filter
const FUNCTION_WORDS = new Set([
  "的", "了", "在", "是", "我", "你", "他", "她", "它", "们",
  "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也",
  "很", "到", "说", "要", "去", "会", "着", "没有", "看", "好",
  "自己", "这", "那个", "这个", "什么", "怎么", "哪", "哪里",
  "吗", "吧", "呢", "可以", "能", "想", "想要", "想用", "想找",
  "找到", "看到", "应该", "觉得", "知道", "可能", "一下", "一些",
  "有点", "把", "被", "让", "给", "对", "从", "向", "往", "跟",
  "用", "以", "为", "因", "所以", "但是", "虽然", "如果", "因为",
  "然后", "而且", "或者", "还是", "已经", "正在", "将要", "马上",
]);

/**
 * Segment text into meaningful CJK tokens.
 * Uses bigrams (2-char) for recall, trigrams (3-char) for precision,
 * and preserves sentence boundaries for context.
 */
export function enhancedSegmentCJK(text: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();

  // Split by sentence boundaries first
  const sentences = text.split(SENTENCE_BREAKS).filter(Boolean);

  for (const sentence of sentences) {
    // Reset lastIndex for the global regex
    CJK_RANGE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CJK_RANGE.exec(sentence)) !== null) {
      const word = match[0];

      // Bigrams (2-char windows) — good for recall
      for (let i = 0; i < word.length - 1; i++) {
        const bigram = word.slice(i, i + 2);
        if (!FUNCTION_WORDS.has(bigram) && !seen.has(bigram)) {
          seen.add(bigram);
          tokens.push(bigram);
        }
      }

      // Trigrams (3-char windows) — better for phrase-level matching
      // Include trigrams longer than 4 chars to avoid capturing function words
      if (word.length >= 3) {
        for (let i = 0; i < word.length - 2; i++) {
          const trigram = word.slice(i, i + 3);
          if (!FUNCTION_WORDS.has(trigram) && !seen.has(trigram)) {
            seen.add(trigram);
            tokens.push(trigram);
          }
        }
      }

      // Keep full words 3+ chars as-is (but not function words)
      if (word.length >= 3 && !FUNCTION_WORDS.has(word) && !seen.has(word)) {
        seen.add(word);
        tokens.push(word);
      }
    }
  }

  return tokens;
}

// ── Query Intent Detection ──────────────────────────────

/**
 * Detect query patterns that benefit from LLM rewriting.
 * Simple heuristics to avoid LLM calls on trivial queries.
 */
export function shouldRewriteQuery(input: string): boolean {
  const len = input.replace(/\s+/g, "").length;
  // Skip very short queries (< 4 chars)
  if (len < 4) return false;
  // Skip single-word queries
  if (!/\s/.test(input) && len <= 6) return false;
  // Skip commands (starting with /)
  if (input.startsWith("/")) return false;
  // Skip pure punctuation or emoji
  if (/^[\p{P}\p{S}\s]+$/u.test(input)) return false;
  return true;
}

// ── LLM Query Rewrite Prompt ─────────────────────────────

const QUERY_REWRITE_SYSTEM_PROMPT = `你是一个游戏世界知识检索系统的查询理解助手。玩家输入可能模糊、口语化或不完整，你需要将其改写为一个或多个精确的检索查询。

规则：
1. 提取关键实体：NPC名称、地点、物品、异常现象
2. 识别玩家意图：探索、对话、战斗、调查、使用物品
3. 将口语表达规范化为标准术语（如「那个戴眼镜的」→ 具体NPC名字）
4. 补充隐含的上下文（如「去楼上看看」→ 补充当前楼层信息）
5. 输出格式：每行一个检索查询，不要编号，不要解释

请严格以 JSON 格式输出，包含以下字段：
- "queries": 检索查询列表（3-5个）
- "intent": 主要意图类型（explore/talk/fight/investigate/use_item/other）
- "entities": 提取的实体列表`;

interface QueryRewriteResult {
  queries: string[];
  intent: string;
  entities: string[];
}

/**
 * Parse LLM output into structured query rewrite result.
 * Handles both JSON and plain-text formats.
 */
function parseRewriteOutput(raw: string): QueryRewriteResult {
  try {
    // Try JSON parse first
    const trimmed = raw.trim();
    // Extract JSON block if wrapped in markdown
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        queries: Array.isArray(parsed.queries) ? parsed.queries.slice(0, 5) : [raw.slice(0, 200)],
        intent: typeof parsed.intent === "string" ? parsed.intent : "other",
        entities: Array.isArray(parsed.entities) ? parsed.entities.slice(0, 10) : [],
      };
    }
  } catch {
    // Fall through to plain-text parsing
  }

  // Plain-text fallback: each line is a query
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^\d+[.、)\s]+/, "").trim())
    .filter((l) => l.length > 2);

  return {
    queries: lines.slice(0, 5),
    intent: "other",
    entities: [],
  };
}

// ── Main Rewrite Function ────────────────────────────────

export interface QueryRewriteOptions {
  /** Player's raw input */
  input: string;
  /** Current player context for entity resolution */
  playerContext?: string;
  /** Current player location */
  playerLocation?: string | null;
  /** Recently encountered entity IDs */
  recentEntities?: string[];
  /** Request ID for Langfuse tracing */
  requestId?: string;
}

/**
 * Rewrite a player query using LLM for better retrieval.
 * Returns the original input unchanged if LLM rewriting is
 * disabled, fails, or the query is too simple.
 */
export async function rewriteQueryWithLlm(
  options: QueryRewriteOptions
): Promise<{
  rewritten: string;
  queries: string[];
  intent: string;
  entities: string[];
  usedLlm: boolean;
  latencyMs: number;
}> {
  const startTime = Date.now();

  // Fast path: feature disabled or query too simple
  if (!isLlmQueryRewriteEnabled() || !shouldRewriteQuery(options.input)) {
    return {
      rewritten: options.input,
      queries: [options.input],
      intent: "other",
      entities: [],
      usedLlm: false,
      latencyMs: 0,
    };
  }

  // Check cache
  const cacheKeyStr = cacheKey(options.input, options.playerContext ?? "");
  const cached = getCached(cacheKeyStr);
  if (cached) {
    return {
      rewritten: cached,
      queries: [cached],
      intent: "other",
      entities: [],
      usedLlm: true,
      latencyMs: 0,
    };
  }

  // Build context for the LLM
  const contextParts: string[] = [];
  if (options.playerLocation) {
    contextParts.push(`当前楼层：${options.playerLocation}`);
  }
  if (options.recentEntities?.length) {
    contextParts.push(`最近遇到的实体：${options.recentEntities.slice(0, 5).join("、")}`);
  }

  const userMessage = [
    contextParts.length > 0 ? `【上下文】\n${contextParts.join("\n")}` : "",
    `【玩家输入】${options.input}`,
    "请改写为检索查询。",
  ].filter(Boolean).join("\n\n");

  // Try LLM rewrite
  try {
    const { getAiService } = await import("@/lib/ai/service");
    const service = getAiService();

    if (!service) {
      return {
        rewritten: options.input,
        queries: [options.input],
        intent: "other",
        entities: [],
        usedLlm: false,
        latencyMs: Date.now() - startTime,
      };
    }

    // Use a fast/cheap model for query rewriting
    const model = envRaw("VERSECRAFT_QUERY_REWRITE_MODEL") ?? "";

    const genSpan = startGeneration({
      name: "ai.query_rewrite",
      provider: "oneapi",
      gatewayModel: model || "fast",
      intendedRole: "query_rewrite",
      actualRole: "query_rewrite",
      attemptIndex: 0,
      retryCount: 0,
      fallbackCount: 0,
      stream: false,
      cacheHit: false,
      success: false, // updated below
      requestId: options.requestId,
    });

    const response = await service.chat({
      messages: [
        { role: "system", content: QUERY_REWRITE_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      model: model || undefined,
      maxTokens: 256,
      temperature: 0.1,
    });

    genSpan.end({
      success: true,
      totalLatencyMs: Date.now() - startTime,
      output: response.content,
    });

    const parsed = parseRewriteOutput(response.content);
    const rewritten = parsed.queries.join(" ").slice(0, 512);

    // Cache the result
    setCache(cacheKeyStr, rewritten);

    return {
      rewritten,
      queries: parsed.queries,
      intent: parsed.intent,
      entities: parsed.entities,
      usedLlm: true,
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    // Fail-open: return original input
    console.warn("[queryRewriter] LLM rewrite failed, using original input", err);
    return {
      rewritten: options.input,
      queries: [options.input],
      intent: "other",
      entities: [],
      usedLlm: false,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Synchronous heuristic query enrichment — complements the LLM rewriter.
 * Can be called without waiting for the LLM.
 */
export function enrichQueryHeuristically(input: string, playerLocation?: string | null): string {
  const parts: string[] = [input];

  // Append location context if the query is location-ambiguous
  if (playerLocation && !/[楼层层FL地下B1B2]/i.test(input)) {
    parts.push(playerLocation);
  }

  return parts.join(" ").slice(0, 512);
}
