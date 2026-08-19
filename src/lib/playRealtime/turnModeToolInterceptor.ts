/**
 * 运行时工具拦截（Human-in-the-Loop Middleware）for player chat DM record.
 *
 * 背景：deepseek-v4-flash on Volcengine Ark Responses API 在 long structured
 * prompt 下偶尔忽略 strict function-call schema 中 `turn_mode: const
 * "decision_required"` 和 `options.minItems=4 / maxItems=4` 的字段约束。Provider
 * 约束解码层只在工具结构层面（"必须调用 submit_player_dm"）生效，对 schema
 * 字段 const / enum 不强制。
 *
 * 替代方案是只在 system prompt 中加 hint——经验上稳定率 < 40%，且会被
 * prompt 注入 / 长度膨胀 / 上下文变化反复破坏。
 *
 * 本模块在 `phaseParseAndNormalizeCandidate` 之后、`phaseApplyStructuralGuards`
 * 之前执行，**等价于 provider 约束解码层的二次把关**：
 * 1. turn_mode 强制为 decision_required（按用户指令"narrative_only 也要转
 *    成可用 json，不影响用户体验"）。
 * 2. options 强制为 4 条：
 *    - 缺失项优先通过 `generateOptionsOnlyFallback` 调 INTENT_PARSE / control
 *      角色做 LLM 二次推理（用户指定路径，避免固定模板造成模板化）。
 *    - LLM 二次推理加 LRU cache（key = hash(narrative + playerContext)），60s
 *      TTL + 32 slot，命中同一回合的多次 fallback 不再二次扣成本。
 *    - LLM 失败 / 超时降级到本地 anchor-模板；模板失败降级到"继续当前行动方向"
 *      占位（不引入新事实）。
 */
import { createHash } from "node:crypto";
import { generateOptionsOnlyFallback } from "@/lib/ai/logicalTasks";
import type { GameStateSnapshot } from "@/lib/evals/playthrough/types";

const TARGET_TURN_MODE = "decision_required";
const TARGET_OPTIONS_LENGTH = 4;
const MAX_OPTION_CHARS = 30;
const CACHE_MAX_SLOTS = 32;
const CACHE_TTL_MS = 60_000;
const LLM_REFILL_BUDGET_MS = 4_000;

type DmRecordLike = Record<string, unknown>;

export type TurnModePlayerState = Pick<
  GameStateSnapshot,
  "playerLocation" | "inventoryItemIds"
> & {
  activeTaskIds?: readonly string[];
  aliveNpcIds?: readonly string[];
};

export type TurnModeToolInterceptorInput = {
  /** parse / normalize 后的 DM record。 */
  record: DmRecordLike;
  /** 当前玩家上下文（location / hp / sanity / 任务），仅用于补 options 时限上下文。 */
  playerContext?: string | null;
  /** 原始 narrative（当 options 不足需要反推时使用）。 */
  narrative?: string;
  /** requestId：写进 _commit_flags / internal_meta，便于 telemetry 关联。 */
  requestId?: string;
  /** player state snapshot（用于补 options 时引用 activeTaskIds / aliveNpcIds）。 */
  playerState?: TurnModePlayerState | null;
  /** AIRequestContext（用于 LLM 二次推理）。 */
  ctx?: {
    requestId: string;
    userId?: string;
    sessionId?: string;
  };
  /** AbortSignal：上层 pipeline 取消时立即中断 LLM refill。 */
  signal?: AbortSignal;
  /** 跳过 LLM 二次推理（测试 / 调试用）。 */
  disableLlmRefill?: boolean;
};

export type TurnModeToolInterceptorResult = {
  record: DmRecordLike;
  correctedTurnMode: boolean;
  /** 是否对 options 长度做过任何修正（补或截断）。 */
  correctedOptionsLength: boolean;
  appendedOptionsCount: number;
  flags: string[];
  /** LLM 二次推理是否成功；用于 telemetry。 */
  llmRefillUsed: boolean;
};

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
}

function clampOption(s: string): string {
  return s.length > MAX_OPTION_CHARS ? `${s.slice(0, MAX_OPTION_CHARS - 1)}…` : s;
}

/**
 * 从 narrative 最后一句提取"动作感"短句作为 options 候选素材。
 * - 提取最后一句 ≤ 24 字符中文短语
 * - 失败时返回 null
 */
function extractNarrativeAnchor(narrative: string | undefined): string | null {
  if (!narrative) return null;
  const trimmed = narrative.trim();
  if (!trimmed) return null;
  const lastSentence = trimmed.split(/[。！？!?\n]/).filter((s) => s.trim().length > 0).pop() ?? "";
  const anchor = lastSentence.trim().slice(0, 24);
  return anchor || null;
}

function buildAnchorFallbackOptions(input: {
  narrative?: string;
  playerContext?: string | null;
  playerState?: TurnModePlayerState | null;
}): string[] {
  const anchor = extractNarrativeAnchor(input.narrative);
  const location =
    input.playerState?.playerLocation ??
    (typeof input.playerContext === "string"
      ? (input.playerContext.match(/位置[:：]\s*([^；;,，]+)/)?.[1] ?? null)
      : null);
  const hasTask = (input.playerState?.activeTaskIds?.length ?? 0) > 0;
  const inventoryHasPhone =
    (input.playerState?.inventoryItemIds ?? []).some((id) => id === "item_phone");

  const base: string[] = [];
  if (anchor) base.push(clampOption(`接着观察${anchor}`));
  if (location) base.push(clampOption(`在${location}仔细听动静`));
  else base.push("停下脚步仔细听动静");
  if (hasTask) base.push("检查当前任务线索");
  else base.push("清点随身物品与线索");
  if (inventoryHasPhone) base.push("掏出手机查看时间信号");
  else base.push("记录眼前的线索与异常");
  // 去重 + 截断到 4
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of base) {
    if (out.length >= TARGET_OPTIONS_LENGTH) break;
    if (seen.has(o)) continue;
    seen.add(o);
    out.push(o);
  }
  while (out.length < TARGET_OPTIONS_LENGTH) {
    out.push("继续当前行动方向");
  }
  return out.slice(0, TARGET_OPTIONS_LENGTH);
}

/* ──────────────────────────────────────────────────────────────────
 * LRU cache for LLM-refill options.
 *
 * Key = sha1(narrative + playerContext + playerLocation + inventoryIds).
 * TTL = 60s — short, because the same (narrative, scene) rarely re-occurs
 * within a session, and stale cache hits would lock in stale scene context.
 * */
type CacheValue = { options: string[]; expiresAt: number };

class OptionsLruCache {
  private readonly map = new Map<string, CacheValue>();
  constructor(private readonly maxSize: number) {}

  get(key: string): string[] | null {
    const value = this.map.get(key);
    if (!value) return null;
    if (value.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, value);
    return value.options;
  }

  set(key: string, options: string[]): void {
    if (this.map.has(key)) this.map.delete(key);
    while (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
    this.map.set(key, { options, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  /** Test helper. */
  clear(): void {
    this.map.clear();
  }
}

const optionsLruCache = new OptionsLruCache(CACHE_MAX_SLOTS);

function buildCacheKey(input: TurnModeToolInterceptorInput): string {
  const h = createHash("sha1");
  h.update(String(input.narrative ?? ""));
  h.update("");
  h.update(String(input.playerContext ?? ""));
  h.update("");
  h.update(String(input.playerState?.playerLocation ?? ""));
  h.update("");
  h.update((input.playerState?.inventoryItemIds ?? []).join(","));
  return h.digest("hex").slice(0, 16);
}

async function tryLlmRefillOptions(input: TurnModeToolInterceptorInput): Promise<string[] | null> {
  if (input.disableLlmRefill) return null;
  if (!input.ctx) return null;
  if (!input.narrative || input.narrative.trim().length === 0) return null;

  const cacheKey = buildCacheKey(input);
  const cached = optionsLruCache.get(cacheKey);
  if (cached) return cached;

  // 已存在 options > 0 不需要 refill（与 caller 决策配合，调用方决定何时调用）。
  // 不在此函数内部判断。

  try {
    const result = await generateOptionsOnlyFallback({
      narrative: input.narrative,
      latestUserInput: "", // options 模板自己组织
      playerContext: input.playerContext ?? "",
      ctx: {
        requestId: input.ctx.requestId,
        userId: input.ctx.userId,
        sessionId: input.ctx.sessionId,
        path: "/api/chat",
        tags: { phase: "hitl_middleware_options_refill" },
      },
      signal: input.signal,
      outputLanguage: "zh-CN",
      budgetMs: LLM_REFILL_BUDGET_MS,
    });
    if (!result.ok) return null;
    const valid = coerceStringArray(result.options).slice(0, TARGET_OPTIONS_LENGTH);
    if (valid.length < 1) return null;
    const filled = valid.length >= TARGET_OPTIONS_LENGTH
      ? valid
      : [
          ...valid,
          ...buildAnchorFallbackOptions(input).slice(valid.length),
        ].slice(0, TARGET_OPTIONS_LENGTH);
    optionsLruCache.set(cacheKey, filled);
    return filled;
  } catch {
    return null;
  }
}

/**
 * HITL middleware 主入口。
 *
 * 输入：phaseParseAndNormalizeCandidate 之后已 normalize 的 DM record。
 * 输出：correction 后的 record。
 *
 * 行为：
 * - turn_mode 永远被强制钉为 TARGET_TURN_MODE（用户指令：不保留 narrative_only）。
 * - options 永远被规整为 TARGET_OPTIONS_LENGTH 项：
 *   1) 缺失时优先通过 INTENT_PARSE / control 角色做 LLM 二次推理
 *      （`generateOptionsOnlyFallback`）；
 *   2) LLM 二次推理带 LRU cache (60s TTL + 32 slots)；
 *   3) LLM 失败 / 超时 / budget 用尽时降级到 anchor-模板；
 *   4) 模板也失败（极端情况）降级到 "继续当前行动方向" 占位。
 */
export async function enforceToolCallShape(input: TurnModeToolInterceptorInput): Promise<TurnModeToolInterceptorResult> {
  const flags: string[] = [];
  const record: DmRecordLike = { ...input.record };
  const originalTurnMode = typeof record.turn_mode === "string" ? record.turn_mode : null;
  const originalOptions = coerceStringArray(record.options);
  const originalDecisionRequired =
    typeof record.decision_required === "boolean" ? record.decision_required : null;
  const originalDecisionOptions = coerceStringArray(record.decision_options);

  let correctedTurnMode = false;
  let correctedOptionsLength = false;
  let appendedOptionsCount = 0;
  let llmRefillUsed = false;

  // Step 1: 统一 options 长度（先用现有 options，再补 decision_options，最后
  // LLM 二次推理，最后 anchor 模板）。
  const truncatedOptions = originalOptions.slice(0, TARGET_OPTIONS_LENGTH);
  const workingOptions = [...truncatedOptions];
  if (workingOptions.length !== TARGET_OPTIONS_LENGTH) {
    correctedOptionsLength = true;
    for (const opt of originalDecisionOptions) {
      if (workingOptions.length >= TARGET_OPTIONS_LENGTH) break;
      if (workingOptions.includes(opt)) continue;
      workingOptions.push(clampOption(opt));
    }
    if (workingOptions.length < TARGET_OPTIONS_LENGTH) {
      const llmRefill = await tryLlmRefillOptions(input);
      if (llmRefill) {
        llmRefillUsed = true;
        flags.push("options_refilled_by_llm");
        const before = workingOptions.length;
        for (const opt of llmRefill) {
          if (workingOptions.length >= TARGET_OPTIONS_LENGTH) break;
          if (workingOptions.includes(opt)) continue;
          workingOptions.push(opt);
        }
        appendedOptionsCount = Math.max(0, workingOptions.length - before);
      } else {
        flags.push("options_refilled_by_template_fallback");
        const fallback = buildAnchorFallbackOptions(input);
        const before = workingOptions.length;
        for (const opt of fallback) {
          if (workingOptions.length >= TARGET_OPTIONS_LENGTH) break;
          if (workingOptions.includes(opt)) continue;
          workingOptions.push(opt);
        }
        appendedOptionsCount = Math.max(0, workingOptions.length - before);
      }
    }
  }
  if (workingOptions.length !== originalOptions.length || correctedOptionsLength) {
    record.options = workingOptions.slice(0, TARGET_OPTIONS_LENGTH);
    if (originalOptions.length > TARGET_OPTIONS_LENGTH) {
      flags.push(`options_truncated_from_${originalOptions.length}`);
    }
  }

  // Step 2: 强制 turn_mode = decision_required
  if (originalTurnMode !== TARGET_TURN_MODE || originalDecisionRequired !== true) {
    record.turn_mode = TARGET_TURN_MODE;
    record.decision_required = true;
    correctedTurnMode = true;
    flags.push(
      originalTurnMode === "narrative_only"
        ? "turn_mode_corrected_from_narrative_only"
        : "turn_mode_corrected_from_missing",
    );
    if (appendedOptionsCount > 0) {
      flags.push(`options_appended_${appendedOptionsCount}`);
    }
  }

  // Step 3: 把改完的 options 写进 decision_options 兼容旧消费者
  if (correctedTurnMode && workingOptions.length > 0) {
    record.decision_options = workingOptions.slice(0, TARGET_OPTIONS_LENGTH);
  }

  // Step 4: 把 flags 写进 _commit_flags 与 internal_meta
  if (flags.length > 0) {
    const existingFlags = Array.isArray(record._commit_flags)
      ? record._commit_flags.filter((x): x is string => typeof x === "string")
      : [];
    record._commit_flags = Array.from(new Set([...existingFlags, ...flags]));

    const existingMeta =
      record.internal_meta && typeof record.internal_meta === "object" && !Array.isArray(record.internal_meta)
        ? (record.internal_meta as Record<string, unknown>)
        : {};
    record.internal_meta = {
      ...existingMeta,
      hitl_turn_mode_interceptor: "applied_v2",
      hitl_corrections: flags.join(","),
      hitl_llm_refill_used: llmRefillUsed,
      ...(input.requestId ? { hitl_request_id: input.requestId } : {}),
    };
  }

  return {
    record,
    correctedTurnMode,
    correctedOptionsLength,
    appendedOptionsCount,
    flags,
    llmRefillUsed,
  };
}

/**
 * Pure helper for tests: builds a minimal options payload from narrative
 * + context, without touching record. + cache. Exported so unit tests can
 * assert the anchor fallback generation rule independently of the main
 * interceptor + the LLM refill path.
 */
export function buildAnchorFallbackOptionsForTest(args: TurnModeToolInterceptorInput): string[] {
  return buildAnchorFallbackOptions({
    narrative: args.narrative,
    playerContext: args.playerContext,
    playerState: args.playerState,
  });
}

/** Test helper to clear the LRU cache between cases. */
export function clearOptionsLruCacheForTest(): void {
  optionsLruCache.clear();
}