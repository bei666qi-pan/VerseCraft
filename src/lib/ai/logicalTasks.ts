/**
 * 逻辑任务层：业务与玩法只应依赖本模块的语义入口，不直接调用 execute*、不绑定厂商模型。
 * 内核仍为 TaskType + taskPolicy + execute + one-api 兼容网关。
 * （不设 `server-only`，以便 Node 单测加载；服务端业务请通过 `@/lib/ai/service` 再导出使用。）
 */

import { executeChatCompletion, executePlayerChatStream } from "@/lib/ai/router/execute";
import type { PlayerChatStreamResult } from "@/lib/ai/router/execute";
import type { OperationMode } from "@/lib/ai/degrade/mode";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { AIRequestContext, ChatMessage, TaskType } from "@/lib/ai/types/core";
import type { TaskBinding } from "@/lib/ai/tasks/taskPolicy";
import type { AIResponse, AIErrorResponse } from "@/lib/ai/types";
import type { ControlPreflightResult } from "@/lib/playRealtime/controlPreflight";
import type { EnhanceAfterMainStreamResult } from "@/lib/playRealtime/narrativeEnhancement";
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";
import type { NarrativeBudget } from "@/lib/playRealtime/narrativeBudgetPackets";
import { VC_WAITING } from "@/lib/perf/waitingConfig";
import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";
import {
  parseNarrativeExpansionJson,
  validateExpandedNarrativeCandidate,
  type NarrativeExpansionResult,
} from "@/lib/turnEngine/narrativeExpansion";

/** 主叙事 / 玩家 SSE：固定 PLAYER_CHAT，由 taskPolicy 解析逻辑角色与 one-api 模型名。 */
export async function generateMainReply(params: {
  messages: ChatMessage[];
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  timeoutMs?: number;
  skipRoles?: readonly AiLogicalRole[];
  maxTokensOverride?: number;
}): Promise<PlayerChatStreamResult> {
  return executePlayerChatStream({
    messages: params.messages,
    ctx: {
      requestId: params.ctx.requestId,
      task: "PLAYER_CHAT",
      userId: params.ctx.userId,
      sessionId: params.ctx.sessionId,
      path: params.ctx.path,
      tags: params.ctx.tags,
    },
    signal: params.signal,
    timeoutMs: params.timeoutMs,
    skipRoles: params.skipRoles,
    maxTokensOverride: params.maxTokensOverride,
  });
}

/** 控制面：意图、槽位、风险标签、增强开关（无剧情正文）。内部任务 PLAYER_CONTROL_PREFLIGHT。 */
export async function parsePlayerIntent(args: {
  latestUserInput: string;
  playerContext: string;
  ruleSnapshot: PlayerRuleSnapshot;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path">;
  signal?: AbortSignal;
}): Promise<ControlPreflightResult> {
  const { runPlayerControlPreflight } = await import("@/lib/playRealtime/controlPreflight");
  return runPlayerControlPreflight(args);
}

/** 主笔流结束后可选的场景/叙事增强（门控 + 预算）。内部可能走 enhance 角色链路。 */
export async function enhanceScene(args: {
  accumulatedJsonText: string;
  control: PlayerControlPlane | null;
  rule: PlayerRuleSnapshot;
  mode: OperationMode;
  baseCtx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path">;
  signal?: AbortSignal;
  isFirstAction: boolean;
  playerContext: string;
  latestUserInput: string;
  /** 0 = use upstream task timeout only. */
  enhanceBudgetMs?: number;
}): Promise<EnhanceAfterMainStreamResult> {
  const { tryEnhanceDmAfterMainStream } = await import("@/lib/playRealtime/narrativeEnhancement");
  return tryEnhanceDmAfterMainStream(args);
}

export type { EnhanceAfterMainStreamResult } from "@/lib/playRealtime/narrativeEnhancement";
export type { ControlPreflightResult } from "@/lib/playRealtime/controlPreflight";
export type { NarrativeExpansionResult } from "@/lib/turnEngine/narrativeExpansion";

export async function expandNarrativeOnly(args: {
  originalNarrative: string;
  originalDmRecord: Record<string, unknown>;
  narrativeBudget: NarrativeBudget;
  latestUserInput: string;
  playerContextSnapshot: string;
  recentNarrativeTail?: string | null;
  constraints?: readonly string[];
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  budgetMs?: number;
}): Promise<NarrativeExpansionResult> {
  const startedAt = Date.now();
  const originalNarrative = String(args.originalNarrative ?? "");
  const beforeChars = Array.from(originalNarrative.replace(/\s+/g, "")).length;
  const budgetMs = Math.max(1, Math.min(8_000, args.budgetMs ?? 6_000));
  const timeout = createTimeoutSignal(args.signal, budgetMs);

  const system: ChatMessage = {
    role: "system",
    content: [
      "你是 VerseCraft 的主叙事受限增写器。你的任务是只扩写 narrative 文本，不裁决新状态。",
      "请严格以 JSON 格式输出，且只能输出一个 JSON 对象，形如：{\"narrative\":\"...\"}。",
      "强约束：只允许替换 narrative。禁止修改 is_action_legal、sanity_damage、is_death、consumes_time、time_cost、player_location、options。",
      "禁止修改 awarded_items、consumed_items、task_updates、relationship_updates、codex_updates、clue_updates、npc_location_updates、main_threat_updates、weapon_updates 等结构字段。",
      "禁止新增 NPC、地点、道具、任务，禁止提前揭示世界真相，必须保持原始事件结论。",
      "只能补充：动作反馈、感官细节、环境阻力、NPC 即时反应、心理压迫、悬疑节奏。",
      `扩写后 narrative 不得超过 ${Math.max(0, Math.round(args.narrativeBudget.maxChars))} 字。`,
      "禁止输出 markdown、解释、代码块或任何额外文本。",
    ].join("\n"),
  };

  const user: ChatMessage = {
    role: "user",
    content: [
      `【玩家本回合输入】\n${String(args.latestUserInput ?? "").slice(0, 500)}`,
      `【上一段尾巴】\n${String(args.recentNarrativeTail ?? "").slice(0, 500)}`,
      `【原始 narrative】\n${originalNarrative.slice(0, 1600)}`,
      `【叙事预算】\n${JSON.stringify({
        tier: args.narrativeBudget.tier,
        minChars: args.narrativeBudget.minChars,
        targetChars: args.narrativeBudget.targetChars,
        maxChars: args.narrativeBudget.maxChars,
        minInfoBeats: args.narrativeBudget.minInfoBeats,
        reasonCodes: args.narrativeBudget.reasonCodes,
      })}`,
      `【原始 DM 结构快照：只能用于保持结论，不能改字段】\n${stringifyCompactDmSnapshot(args.originalDmRecord)}`,
      `【玩家状态摘要】\n${String(args.playerContextSnapshot ?? "").slice(0, 1200)}`,
      args.constraints && args.constraints.length > 0
        ? `【额外约束】\n${args.constraints.map((x) => `- ${String(x).slice(0, 160)}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };

  try {
    const res: AIResponse | AIErrorResponse = await executeChatCompletion({
      task: "NARRATIVE_EXPANSION",
      messages: [system, user],
      ctx: {
        requestId: args.ctx.requestId,
        task: "NARRATIVE_EXPANSION",
        userId: args.ctx.userId,
        sessionId: args.ctx.sessionId,
        path: args.ctx.path,
        tags: { ...(args.ctx.tags ?? {}), purpose: "narrative_expansion" },
      },
      signal: timeout.signal,
      requestTimeoutMs: budgetMs,
      skipCache: true,
    });

    if (!res.ok) {
      return {
        ok: false,
        reason: timeout.timedOut() ? "timeout" : `ai_error:${res.code}`,
        latencyMs: Date.now() - startedAt,
        beforeChars,
      };
    }

    const parsed = parseNarrativeExpansionJson(res.content);
    if (!parsed.ok) {
      return {
        ok: false,
        reason: parsed.reason,
        latencyMs: Date.now() - startedAt,
        beforeChars,
      };
    }

    const validated = validateExpandedNarrativeCandidate({
      originalNarrative,
      candidateNarrative: parsed.narrative,
      budget: args.narrativeBudget,
    });
    if (!validated.ok) {
      return {
        ok: false,
        reason: validated.reason,
        latencyMs: Date.now() - startedAt,
        beforeChars: validated.beforeChars,
        afterChars: validated.afterChars,
        ignoredFieldKeys: parsed.ignoredFieldKeys,
      };
    }

    return {
      ok: true,
      narrative: validated.narrative,
      latencyMs: Date.now() - startedAt,
      beforeChars: validated.beforeChars,
      afterChars: validated.afterChars,
      ignoredFieldKeys: parsed.ignoredFieldKeys,
    };
  } finally {
    timeout.cleanup();
  }
}

/** 与 resolveDmTurn clamp 对齐：单条选项最长 40 字。 */
function createTimeoutSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal | undefined;
  cleanup: () => void;
  timedOut: () => boolean;
} {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { signal: parent, cleanup: () => {}, timedOut: () => false };
  }
  const ac = new AbortController();
  let timedOut = false;
  const tid = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, Math.max(1, Math.trunc(timeoutMs)));

  const onParentAbort = () => {
    clearTimeout(tid);
    ac.abort();
  };
  parent?.addEventListener("abort", onParentAbort, { once: true });

  return {
    signal:
      typeof AbortSignal !== "undefined" && "any" in AbortSignal
        ? AbortSignal.any(parent ? [parent, ac.signal] : [ac.signal])
        : ac.signal,
    cleanup: () => {
      clearTimeout(tid);
      parent?.removeEventListener("abort", onParentAbort);
    },
    timedOut: () => timedOut,
  };
}

function stringifyCompactDmSnapshot(dmRecord: Record<string, unknown>): string {
  const keys = [
    "is_action_legal",
    "sanity_damage",
    "is_death",
    "consumes_time",
    "time_cost",
    "player_location",
    "options",
    "awarded_items",
    "consumed_items",
    "task_updates",
    "relationship_updates",
    "codex_updates",
    "clue_updates",
    "npc_location_updates",
    "main_threat_updates",
    "weapon_updates",
  ];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(dmRecord, key)) out[key] = dmRecord[key];
  }
  return JSON.stringify(out).slice(0, 1400);
}

export function parseOptionsArrayFromAiJson(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    let t: string | null = null;
    if (typeof x === "string") {
      t = x.trim();
    } else if (x && typeof x === "object" && !Array.isArray(x)) {
      const o = x as Record<string, unknown>;
      if (typeof o.label === "string" && o.label.trim()) t = o.label.trim();
      else if (typeof o.text === "string" && o.text.trim()) t = o.text.trim();
    }
    if (!t) continue;
    if (t.length < 2 || t.length > 40) continue;
    out.push(t);
    if (out.length >= 4) break;
  }
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const s of out) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(s);
  }
  return uniq.slice(0, 4);
}

export { isNonNarrativeOptionLike } from "@/lib/play/optionQuality";

function guardModelGeneratedOptions(options: string[], maxCount = 4): string[] {
  const out: string[] = [];
  for (const option of filterNarrativeActionOptions(options, maxCount * 2)) {
    const t = String(option ?? "").trim();
    if (!t) continue;
    if (out.some((x) => areOptionsTooSimilar(x, t))) continue;
    out.push(t);
    if (out.length >= maxCount) break;
  }
  return out;
}

function normalizeForLooseDedup(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[。！？…,.!?\s]+/g, "")
    .replace(/^(我先|我就|我先把|我先去|先把|先去|先)/, "")
    .replace(/(一下|一点|一会儿|一会|再说|再动|再走)$/, "");
}

function areOptionsTooSimilar(a: string, b: string): boolean {
  const na = normalizeForLooseDedup(a);
  const nb = normalizeForLooseDedup(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 6 && nb.includes(na)) return true;
  if (nb.length >= 6 && na.includes(nb)) return true;
  return false;
}

export function guardOptionsQualityToFour(args: {
  options: string[];
  playerContext?: string;
  recentActionHint?: string;
}): string[] {
  void args.playerContext;
  void args.recentActionHint;
  return guardModelGeneratedOptions(args.options ?? [], 4);
}

function finalizeOptionsFallbackParsed(parsed: string[]): { ok: true; options: string[] } | null {
  const guarded = guardModelGeneratedOptions(parsed, 4);
  if (guarded.length === 4) return { ok: true, options: guarded };
  return null;
}

export type OptionsOnlyFallbackResult =
  | { ok: true; options: string[]; repairUsed?: boolean; latencyMs?: number }
  | {
      ok: false;
      reason: string;
      debugReasonCodes?: string[];
      rawLength?: number;
      extractedOptionsCount?: number;
      normalizedOptionsCount?: number;
      latencyMs?: number;
    };

async function runOptionsOnlyAiOnce(args: {
  narrative: string;
  latestUserInput: string;
  playerContext: string;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  temperature: number;
  systemExtra?: string;
  timeoutMs: number;
}): Promise<{ ok: true; content: string } | { ok: false; reason: string }> {
  const system: ChatMessage = {
    role: "system",
    content: [
      "你是互动叙事平台的行动选项主笔助手，任务是在正文生成之后，为玩家实时生成下一步可点击行动选项。",
      "你必须只输出一个 JSON 对象，形如：{\"options\":[\"...\",\"...\",\"...\",\"...\"]}。",
      "严格要求：options 恰好 4 条，中文简体，每条 5–20 字，第一人称行动句，不重复，贴合当前剧情与玩家状态。",
      [
        "四条必须彼此差异明显，禁止四条都变成同义弱变化（例如都以“我先看看/我先观察/我先确认”开头）。",
        "你必须让四条在行动类型上分化，并尽量覆盖以下至少三类：",
        "- 信息获取：观察/调查/检查/倾听/记录",
        "- 推进剧情：进入/靠近/打开/触发/跟随/询问关键点",
        "- 风险控制：后撤/绕开/找退路/保持距离/拖延",
        "- 交涉：对话/喊话/确认在场者意图（若附近有人）",
        "- 使用物品：手机/手电/钥匙等（若上下文可用）",
        "最低要求：至少 1 条低风险 + 1 条推进性 + 1 条信息获取型行动。",
        "禁止把选项写成 UI/面板/资料簿操作，例如“查看灵感手记”“检查背包”“查看仓库/成就”“打开武器栏/游戏指南”“打开任务/属性/菜单”“使用道具”。",
        "若要用物品，必须写成具体场景动作，例如“我用手电照向门缝”，不能写泛化的“使用道具”。",
        "选项只能承接刚生成的正文，推动下一步行动；不得复用开场固定选项，也不得给素材类型标签。",
      ].join("\n"),
      "禁止输出任何解释、禁止输出 markdown、禁止输出代码块、禁止输出额外字段。",
      args.systemExtra ?? "",
    ]
      .filter((s) => s.length > 0)
      .join("\n"),
  };
  const user: ChatMessage = {
    role: "user",
    content: [
      `【本回合玩家输入】${String(args.latestUserInput ?? "").slice(0, 400)}`,
      `【本回合叙事（narrative）】${String(args.narrative ?? "").slice(0, 1200)}`,
      `【玩家状态摘要】${String(args.playerContext ?? "").slice(0, 1200)}`,
    ].join("\n"),
  };

  const res: AIResponse | AIErrorResponse = await executeChatCompletion({
    task: "INTENT_PARSE",
    messages: [system, user],
    ctx: {
      requestId: args.ctx.requestId,
      task: "INTENT_PARSE",
      userId: args.ctx.userId,
      sessionId: args.ctx.sessionId,
      path: args.ctx.path,
      tags: { ...(args.ctx.tags ?? {}), purpose: "options_regen" },
    },
    signal: args.signal,
    // Keep repair attempts bounded. Callers pass a wall-clock budget and this
    // helper must not stretch the visible turn by silently upgrading to a long timeout.
    requestTimeoutMs: args.timeoutMs,
    skipCache: true,
    devOverrides: {
      // Reasoning models spend most tokens on reasoning_content before emitting content.
      // 256 is not enough — the model hits max_tokens with empty content.
      maxTokens: 384,
      temperature: args.temperature,
      timeoutMs: args.timeoutMs,
      responseFormatJsonObject: true,
    },
  });

  if (!res.ok) return { ok: false, reason: `ai_error:${res.code}` };
  return { ok: true, content: res.content };
}

/**
 * 当主 DM JSON 没给出 options 时的补救：快速二次调用，仅生成 {options:[...]}（非硬编码、非沿用旧选项）。
 * 复用在线短 JSON 任务（INTENT_PARSE / control 角色），避免拉长主链路。
 */
export async function generateOptionsOnlyFallback(args: {
  narrative: string;
  latestUserInput: string;
  playerContext: string;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  systemExtra?: string;
  /**
   * Hard budget wall-clock for the entire fallback tool.
   * When hit, skip upstream calls and return failure; callers must not synthesize visible options.
   *
   * 设计目标：让“补 options”更像低成本工具，而不是第二次长等待。
   */
  budgetMs?: number;
}): Promise<OptionsOnlyFallbackResult> {
  const budgetMs = Math.max(0, Math.min(VC_WAITING.optionsOnlyServerBudgetMs, args.budgetMs ?? VC_WAITING.optionsOnlyServerBudgetMs));
  const t0 = Date.now();
  const remainingMs = () => (budgetMs > 0 ? Math.max(0, budgetMs - (Date.now() - t0)) : Infinity);

  // If budget is too tight, skip any upstream attempt.
  if (budgetMs > 0 && remainingMs() < 350) {
    return { ok: false, reason: "budget_exhausted_before_ai" };
  }

  const tryParse = (
    content: string
  ): { ok: true; options: string[] } | {
    ok: false;
    reason: string;
    debugReasonCodes: string[];
    rawLength: number;
    extractedOptionsCount: number;
    normalizedOptionsCount: number;
    acceptedOptions: string[];
  } => {
    const rawLength = String(content ?? "").length;
    const cleaned = String(content ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    if (!cleaned) {
      return {
        ok: false,
        reason: "empty_model_content",
        debugReasonCodes: ["empty_content"],
        rawLength,
        extractedOptionsCount: 0,
        normalizedOptionsCount: 0,
        acceptedOptions: [],
      };
    }
    let obj: Record<string, unknown>;
    try {
      // Strip markdown code fences that some models wrap around JSON
      obj = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        reason: "non_json_model_content",
        debugReasonCodes: ["parse_failed"],
        rawLength,
        extractedOptionsCount: 0,
        normalizedOptionsCount: 0,
        acceptedOptions: [],
      };
    }
    const parsed = parseOptionsArrayFromAiJson(obj.options ?? (obj as any).decision_options);
    const done = finalizeOptionsFallbackParsed(parsed);
    if (!done) {
      const normalized = guardOptionsQualityToFour({
        options: parsed,
        playerContext: args.playerContext,
        recentActionHint: args.latestUserInput,
      });
      return {
        ok: false,
        reason: "insufficient_model_options",
        debugReasonCodes: ["insufficient_options"],
        rawLength,
        extractedOptionsCount: parsed.length,
        normalizedOptionsCount: normalized.length,
        acceptedOptions: normalized,
      };
    }
    const guarded = guardOptionsQualityToFour({
      options: done.options,
      playerContext: args.playerContext,
      recentActionHint: args.latestUserInput,
    });
    if (guarded.length !== 4) {
      return {
        ok: false,
        reason: "semantic_gate_rejected",
        debugReasonCodes: ["semantic_gate_rejected"],
        rawLength,
        extractedOptionsCount: done.options.length,
        normalizedOptionsCount: guarded.length,
        acceptedOptions: guarded,
      };
    }
    return { ok: true, options: guarded };
  };

  const withBudgetSignal = (timeoutMs: number): AbortSignal | undefined => {
    const base = args.signal;
    if (budgetMs <= 0) return base;
    const rem = remainingMs();
    const t = Math.max(1, Math.min(timeoutMs, rem));
    if (!Number.isFinite(t) || t <= 0) return base;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), t);
    ac.signal.addEventListener("abort", () => clearTimeout(tid), { once: true });
    const signals: AbortSignal[] = [ac.signal];
    if (base) {
      base.addEventListener(
        "abort",
        () => {
          clearTimeout(tid);
          ac.abort();
        },
        { once: true }
      );
      signals.push(base);
    }
    return typeof AbortSignal !== "undefined" && "any" in AbortSignal ? AbortSignal.any(signals) : ac.signal;
  };

  // Options regen is a strict short-link path: one bounded model attempt plus,
  // only when partial model options exist, one bounded repair pass.
  const firstTimeoutMs = Math.max(
    1,
    Math.min(VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs, budgetMs > 0 ? remainingMs() : VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs)
  );
  const failFromParse = (
    failure: ReturnType<typeof tryParse> | null,
    reason = "invalid_model_options"
  ): Extract<OptionsOnlyFallbackResult, { ok: false }> => ({
    ok: false,
    reason,
    debugReasonCodes: failure && !failure.ok ? failure.debugReasonCodes : ["parse_failed"],
    rawLength: failure && !failure.ok ? failure.rawLength : undefined,
    extractedOptionsCount: failure && !failure.ok ? failure.extractedOptionsCount : undefined,
    normalizedOptionsCount: failure && !failure.ok ? failure.normalizedOptionsCount : undefined,
    latencyMs: Date.now() - t0,
  });

  const first = await runOptionsOnlyAiOnce({
    ...args,
    temperature: 0.4,
    systemExtra: args.systemExtra,
    timeoutMs: firstTimeoutMs,
    signal: withBudgetSignal(firstTimeoutMs),
  });
  let lastParseFailure: Extract<ReturnType<typeof tryParse>, { ok: false }> | null = null;
  if (first.ok) {
    const done = tryParse(first.content);
    if (done.ok) return { ...done, latencyMs: Date.now() - t0 };
    lastParseFailure = done;
  } else {
    return { ok: false, reason: first.reason, debugReasonCodes: [first.reason], latencyMs: Date.now() - t0 };
  }

  if (budgetMs > 0 && remainingMs() < 1500) {
    // 不注入本地罐头选项；客户端可在正文落地后再请求一次纯模型选项生成。
    return {
          ok: false,
          reason: "invalid_model_options",
          debugReasonCodes: lastParseFailure?.debugReasonCodes ?? ["parse_failed"],
          rawLength: lastParseFailure?.rawLength,
          extractedOptionsCount: lastParseFailure?.extractedOptionsCount,
          normalizedOptionsCount: lastParseFailure?.normalizedOptionsCount,
          latencyMs: Date.now() - t0,
        };
  }

  const acceptedOptions = lastParseFailure?.acceptedOptions ?? [];
  if (acceptedOptions.length === 0 || acceptedOptions.length >= 4) return failFromParse(lastParseFailure);
  if (budgetMs > 0 && remainingMs() < 500) return failFromParse(lastParseFailure, "budget_exhausted_before_repair");

  const missingCount = 4 - acceptedOptions.length;
  const repairTimeoutMs = Math.max(
    1,
    Math.min(VC_WAITING.optionsOnlyFallbackAttempt2TimeoutMs, budgetMs > 0 ? remainingMs() : VC_WAITING.optionsOnlyFallbackAttempt2TimeoutMs)
  );

  const second = await runOptionsOnlyAiOnce({
    ...args,
    latestUserInput: [
      args.latestUserInput,
      "",
      "[accepted_options_locked]",
      ...acceptedOptions,
      `[repair_missing_slots:${missingCount}]`,
    ].join("\n"),
    temperature: 0.55,
    systemExtra: [
      args.systemExtra ?? "",
      `Repair pass only: keep accepted_options_locked unchanged and add exactly ${missingCount} new scene-specific options. Do not rewrite accepted options.`,
    ].filter(Boolean).join("\n"),
    timeoutMs: repairTimeoutMs,
    signal: withBudgetSignal(repairTimeoutMs),
  });
  if (second.ok) {
    const done = tryParse(second.content);
    const merged = guardOptionsQualityToFour({
      options: [...acceptedOptions, ...(done.ok ? done.options : done.acceptedOptions)],
      playerContext: args.playerContext,
      recentActionHint: args.latestUserInput,
    });
    if (merged.length === 4) return { ok: true, options: merged, repairUsed: true, latencyMs: Date.now() - t0 };
    lastParseFailure = done.ok
      ? {
          ok: false,
          reason: "semantic_gate_rejected",
          debugReasonCodes: ["semantic_gate_rejected", "repair_pass_used"],
          rawLength: String(second.content ?? "").length,
          extractedOptionsCount: done.options.length,
          normalizedOptionsCount: merged.length,
          acceptedOptions: merged,
        }
      : {
          ...done,
          debugReasonCodes: Array.from(new Set([...done.debugReasonCodes, "repair_pass_used"])),
          normalizedOptionsCount: merged.length,
          acceptedOptions: merged,
        };
  }

  return second.ok
    ? {
        ok: false,
        reason: "invalid_model_options",
        debugReasonCodes: lastParseFailure?.debugReasonCodes ?? ["parse_failed"],
        rawLength: lastParseFailure?.rawLength,
        extractedOptionsCount: lastParseFailure?.extractedOptionsCount,
        normalizedOptionsCount: lastParseFailure?.normalizedOptionsCount,
        latencyMs: Date.now() - t0,
      }
    : { ok: false, reason: second.reason, debugReasonCodes: [second.reason, "repair_pass_used"], latencyMs: Date.now() - t0 };
}

async function runDecisionOnlyAiOnce(args: {
  narrative: string;
  latestUserInput: string;
  playerContext: string;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  temperature: number;
  systemExtra?: string;
  timeoutMs: number;
}): Promise<{ ok: true; content: string } | { ok: false; reason: string }> {
  const system: ChatMessage = {
    role: "system",
    content: [
      "你是互动叙事平台的决策选项主笔助手，任务是在正文生成之后，为玩家生成关键节点的决策选项。",
      "你必须只输出一个 JSON 对象，形如：{\"decision_options\":[\"...\",\"...\"]}。",
      "严格要求：decision_options 只能有 2–4 条，中文简体，每条 5–24 字，第一人称行动句，不重复，贴合当前剧情与玩家状态。",
      "这 2–4 条必须真正分叉后果，不允许换皮同义句，不允许只是不同措辞的同一个行动。",
      "禁止把选项写成 UI/面板/资料簿操作，例如“查看灵感手记”“检查背包”“查看仓库/成就”“打开武器栏/游戏指南”“打开任务/属性/菜单”“使用道具”。",
      "禁止输出任何解释、禁止输出 markdown、禁止输出代码块、禁止输出额外字段。",
      args.systemExtra ?? "",
    ]
      .filter((s) => s.length > 0)
      .join("\n"),
  };
  const user: ChatMessage = {
    role: "user",
    content: [
      `【本回合玩家输入】${String(args.latestUserInput ?? "").slice(0, 400)}`,
      `【本回合叙事（narrative）】${String(args.narrative ?? "").slice(0, 1400)}`,
      `【玩家状态摘要】${String(args.playerContext ?? "").slice(0, 1200)}`,
    ].join("\n"),
  };

  const res: AIResponse | AIErrorResponse = await executeChatCompletion({
    task: "INTENT_PARSE",
    messages: [system, user],
    ctx: {
      requestId: args.ctx.requestId,
      task: "INTENT_PARSE",
      userId: args.ctx.userId,
      sessionId: args.ctx.sessionId,
      path: args.ctx.path,
      tags: { ...(args.ctx.tags ?? {}), purpose: "decision_options_regen" },
    },
    signal: args.signal,
    requestTimeoutMs: args.timeoutMs,
    skipCache: true,
    devOverrides: {
      maxTokens: 384,
      temperature: args.temperature,
      timeoutMs: args.timeoutMs,
      responseFormatJsonObject: true,
    },
  });

  if (!res.ok) return { ok: false, reason: `ai_error:${res.code}` };
  return { ok: true, content: res.content };
}

export async function generateDecisionOptionsOnlyFallback(args: {
  narrative: string;
  latestUserInput: string;
  playerContext: string;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  systemExtra?: string;
  /** See `generateOptionsOnlyFallback.budgetMs`. */
  budgetMs?: number;
}): Promise<{ ok: true; decision_options: string[] } | { ok: false; reason: string }> {
  const budgetMs = Math.max(0, Math.min(VC_WAITING.optionsOnlyServerBudgetMs, args.budgetMs ?? VC_WAITING.optionsOnlyServerBudgetMs));
  const t0 = Date.now();
  const remainingMs = () => (budgetMs > 0 ? Math.max(0, budgetMs - (Date.now() - t0)) : Infinity);

  if (budgetMs > 0 && remainingMs() < 350) {
    return { ok: false, reason: "budget_exhausted_before_ai" };
  }

  const tryParse = (content: string): { ok: true; decision_options: string[] } | null => {
    try {
      const obj = JSON.parse(content) as Record<string, unknown>;
      const parsed = parseOptionsArrayFromAiJson((obj as any).decision_options);
      const clipped = guardModelGeneratedOptions(parsed, 4);
      if (clipped.length >= 2) return { ok: true, decision_options: clipped };
      return null;
    } catch {
      return null;
    }
  };

  const withBudgetSignal = (timeoutMs: number): AbortSignal | undefined => {
    const base = args.signal;
    if (budgetMs <= 0) return base;
    const rem = remainingMs();
    const t = Math.max(1, Math.min(timeoutMs, rem));
    if (!Number.isFinite(t) || t <= 0) return base;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), t);
    ac.signal.addEventListener("abort", () => clearTimeout(tid), { once: true });
    const signals: AbortSignal[] = [ac.signal];
    if (base) {
      base.addEventListener(
        "abort",
        () => {
          clearTimeout(tid);
          ac.abort();
        },
        { once: true }
      );
      signals.push(base);
    }
    return typeof AbortSignal !== "undefined" && "any" in AbortSignal ? AbortSignal.any(signals) : ac.signal;
  };

  const first = await runDecisionOnlyAiOnce({
    ...args,
    temperature: 0.35,
    systemExtra: args.systemExtra,
    timeoutMs: VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs,
    signal: withBudgetSignal(VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs),
  });
  if (first.ok) {
    const done = tryParse(first.content);
    if (done) return done;
  }

  if (budgetMs > 0 && remainingMs() < 350) {
    return { ok: false, reason: first.ok ? "invalid_model_decision_options" : first.reason };
  }

  const second = await runDecisionOnlyAiOnce({
    ...args,
    temperature: 0.6,
    systemExtra: [args.systemExtra ?? "", "本次必须输出 2–4 条 decision_options，至少 2 条。"].filter(Boolean).join("\n"),
    timeoutMs: VC_WAITING.optionsOnlyFallbackAttempt2TimeoutMs,
    signal: withBudgetSignal(VC_WAITING.optionsOnlyFallbackAttempt2TimeoutMs),
  });
  if (second.ok) {
    const done = tryParse(second.content);
    if (done) return done;
  }

  return { ok: false, reason: second.ok ? "invalid_model_decision_options" : second.reason };
}

export type OfflineReasonerKind = "worldbuild" | "storyline" | "dev_assist";

function offlineReasonerTaskType(kind: OfflineReasonerKind): TaskType {
  if (kind === "worldbuild") return "WORLDBUILD_OFFLINE";
  if (kind === "storyline") return "STORYLINE_SIMULATION";
  return "DEV_ASSIST";
}

/** 离线/后台推理类任务（世界构建、剧情推演、管理洞察等），由 kind 映射到固定 TaskType。 */
export async function runOfflineReasonerTask(params: {
  kind: OfflineReasonerKind;
  messages: ChatMessage[];
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  skipCache?: boolean;
  devOverrides?: Partial<Pick<TaskBinding, "maxTokens" | "temperature" | "timeoutMs" | "responseFormatJsonObject">>;
}): Promise<AIResponse | AIErrorResponse> {
  const task = offlineReasonerTaskType(params.kind);
  return executeChatCompletion({
    task,
    messages: params.messages,
    ctx: {
      requestId: params.ctx.requestId,
      task,
      userId: params.ctx.userId,
      sessionId: params.ctx.sessionId,
      path: params.ctx.path,
      tags: params.ctx.tags,
    },
    signal: params.signal,
    requestTimeoutMs: params.requestTimeoutMs,
    skipCache: params.skipCache,
    devOverrides: params.devOverrides,
  });
}

/**
 * 后台分析统一入口：DEV_ASSIST + json_object + 默认禁用缓存（避免旧快照错配新数据）。
 * 用于 admin 洞察、结算复盘等“证据驱动”的离线分析任务。
 */
export async function runBackofficeReasonerJsonTask(params: {
  messages: ChatMessage[];
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  requestTimeoutMs?: number;
  skipCache?: boolean;
  devOverrides?: Partial<Pick<TaskBinding, "maxTokens" | "temperature" | "timeoutMs" | "responseFormatJsonObject">>;
}): Promise<AIResponse | AIErrorResponse> {
  return runOfflineReasonerTask({
    kind: "dev_assist",
    messages: params.messages,
    ctx: params.ctx,
    requestTimeoutMs: params.requestTimeoutMs,
    skipCache: params.skipCache ?? true,
    devOverrides: {
      responseFormatJsonObject: true,
      temperature: 0.2,
      ...(params.devOverrides ?? {}),
    },
  });
}

/** 会话记忆压缩（长对话摘要），固定 MEMORY_COMPRESSION。 */
export async function compressSessionMemory(params: {
  messages: ChatMessage[];
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  requestTimeoutMs?: number;
}): Promise<AIResponse | AIErrorResponse> {
  return executeChatCompletion({
    task: "MEMORY_COMPRESSION",
    messages: params.messages,
    ctx: {
      requestId: params.ctx.requestId,
      task: "MEMORY_COMPRESSION",
      userId: params.ctx.userId,
      sessionId: params.ctx.sessionId,
      path: params.ctx.path,
      tags: params.ctx.tags,
    },
    requestTimeoutMs: params.requestTimeoutMs,
  });
}

/**
 * 规则裁决类 JSON 输出（待接入具体玩法管线时可调用）。
 * 固定 RULE_RESOLUTION，主叙事逻辑角色由 taskPolicy 决定。
 */
export async function resolveRuleOutcome(params: {
  messages: ChatMessage[];
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  devOverrides?: Partial<Pick<TaskBinding, "maxTokens" | "temperature" | "timeoutMs" | "responseFormatJsonObject">>;
}): Promise<AIResponse | AIErrorResponse> {
  return executeChatCompletion({
    task: "RULE_RESOLUTION",
    messages: params.messages,
    ctx: {
      requestId: params.ctx.requestId,
      task: "RULE_RESOLUTION",
      userId: params.ctx.userId,
      sessionId: params.ctx.sessionId,
      path: params.ctx.path,
      tags: params.ctx.tags,
    },
    signal: params.signal,
    requestTimeoutMs: params.requestTimeoutMs,
    devOverrides: params.devOverrides,
  });
}

/**
 * 战斗叙事生成（待接入具体玩法管线时可调用）。
 * 固定 COMBAT_NARRATION。
 */
export async function narrateCombat(params: {
  messages: ChatMessage[];
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  devOverrides?: Partial<Pick<TaskBinding, "maxTokens" | "temperature" | "timeoutMs" | "responseFormatJsonObject">>;
}): Promise<AIResponse | AIErrorResponse> {
  return executeChatCompletion({
    task: "COMBAT_NARRATION",
    messages: params.messages,
    ctx: {
      requestId: params.ctx.requestId,
      task: "COMBAT_NARRATION",
      userId: params.ctx.userId,
      sessionId: params.ctx.sessionId,
      path: params.ctx.path,
      tags: params.ctx.tags,
    },
    signal: params.signal,
    requestTimeoutMs: params.requestTimeoutMs,
    devOverrides: params.devOverrides,
  });
}
