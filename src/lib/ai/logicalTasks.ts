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
import { VC_WAITING } from "@/lib/perf/waitingConfig";
import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";

/** 主叙事 / 玩家 SSE：固定 PLAYER_CHAT，由 taskPolicy 解析逻辑角色与 one-api 模型名。 */
export async function generateMainReply(params: {
  messages: ChatMessage[];
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  timeoutMs?: number;
  skipRoles?: readonly AiLogicalRole[];
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

/** 与 resolveDmTurn clamp 对齐：单条选项最长 40 字。 */
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

function contextualFallbackPad(playerContext: string): readonly string[] {
  const ctx = String(playerContext ?? "");
  const loc = ctx.match(/用户位置\[([^\]]+)\]/)?.[1]?.trim() || "";
  const hasThreat = /主威胁状态：/.test(ctx) && /(active|suppressed|breached|危险|压制|失控)/.test(ctx);
  const npcLine = ctx.match(/NPC当前位置：([^。]+)。/)?.[1]?.trim() || "";
  const npcHint = npcLine ? "我先压低声音，向附近的人确认情况。" : "我先侧耳听周围动静。";
  const placeHint = loc ? `我先沿${loc.includes("B1") ? "安全区方向" : "走廊边缘"}调整站位，找遮蔽物。` : "我先找一处更稳的站位。";
  const threatHint = hasThreat ? "我先拉开距离，确认退路与危险来源。" : "我先确认退路与可用遮蔽物。";
  const probeHint = hasThreat ? "我先用小动作试探对方反应。" : "我先做个小试探，确认周围反应。";
  return [
    threatHint,
    npcHint,
    placeHint,
    probeHint,
  ];
}

type OptionActionKind = "dialogue" | "observe" | "move" | "item" | "avoid" | "probe" | "wait" | "other";

function classifyOptionKind(text: string): OptionActionKind {
  const s = String(text ?? "").trim();
  if (!s) return "other";
  const t = s.replace(/[。！？…,.!?\s]+/g, "");
  if (/(询问|问清|打听|交涉|说服|呼喊|喊话|对话|打招呼|确认情况)/.test(t)) return "dialogue";
  if (/(观察|查看|检查|搜寻|侧耳|倾听|翻找|辨认|记录|对照)/.test(t)) return "observe";
  if (/(后撤|退回|撤到|躲开|绕开|避开|保持距离|找退路|掩体|遮蔽|拉开距离)/.test(t)) return "avoid";
  if (/(移动|靠近|走向|前进|转移|换位|贴墙|贴近|进入|离开|调整站位)/.test(t)) return "move";
  if (/(使用|拿出|点亮|打开|关上|拨打|拍照|照明|钥匙|手机|手电|符|药|绷带)/.test(t)) return "item";
  if (/(试探|敲击|轻触|投石|小动作|测试|验证)/.test(t)) return "probe";
  if (/(等待|拖延|按兵不动|停一停|稳住|深呼吸)/.test(t)) return "wait";
  return "other";
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

/**
 * 将 0–4 条候选选项与通用短句合并为恰好 4 条（去重）。
 * 注意：实时 options-only 模型补救不再调用该本地补齐，避免用通用短句冒充大模型选项。
 */
export function padOptionsFallbackToFour(options: string[], playerContext?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (s: string) => {
    const t = String(s ?? "").trim();
    if (t.length < 2) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  for (const s of options) pushUnique(s);
  // 兜底也要尽量贴近当前上下文：避免“四条都像同一种泛化观察”
  const ctx = String(playerContext ?? "");
  for (const g of contextualFallbackPad(ctx)) {
    if (out.length >= 4) break;
    pushUnique(g);
  }
  return out.slice(0, 4);
}

export function guardOptionsQualityToFour(args: {
  options: string[];
  playerContext?: string;
  recentActionHint?: string;
}): string[] {
  const ctx = String(args.playerContext ?? "");
  const recent = String(args.recentActionHint ?? "");
  const npcPresent = /NPC当前位置：([^。]+)。/.test(ctx);
  const hasThreat = /主威胁状态：/.test(ctx) && /(active|suppressed|breached|危险|压制|失控)/.test(ctx);

  const base: string[] = [];
  for (const s of args.options ?? []) {
    const t = String(s ?? "").trim();
    if (!t) continue;
    if (base.some((x) => areOptionsTooSimilar(x, t))) continue;
    base.push(t);
    if (base.length >= 4) break;
  }

  const out: string[] = [];
  const kinds = new Set<OptionActionKind>();
  const push = (s: string) => {
    const t = String(s ?? "").trim();
    if (!t) return;
    if (out.some((x) => areOptionsTooSimilar(x, t))) return;
    out.push(t);
    kinds.add(classifyOptionKind(t));
  };
  for (const s of base) push(s);

  // 补齐缺失类型：优先规避/交涉（视上下文），再补信息/移动/道具/试探
  const fallbacks = padOptionsFallbackToFour([], ctx);
  const tryFillByKind = (kind: OptionActionKind) => {
    for (const f of fallbacks) {
      if (out.length >= 4) return;
      if (classifyOptionKind(f) !== kind) continue;
      push(f);
    }
  };

  if (hasThreat && !kinds.has("avoid")) tryFillByKind("avoid");
  if (npcPresent && !kinds.has("dialogue")) tryFillByKind("dialogue");
  if (!kinds.has("observe")) tryFillByKind("observe");
  if (!kinds.has("move")) tryFillByKind("move");
  if (!kinds.has("item")) tryFillByKind("item");
  if (!kinds.has("probe")) tryFillByKind("probe");
  if (!kinds.has("wait")) tryFillByKind("wait");

  // 轻量贴场景补句（基于最近动作的关键字，不做复杂 NLP）
  if (recent && out.length < 4) {
    if (/(手机|手电|照明|拍照)/.test(recent)) push("我先用手机灯照一下关键细节。");
    if (/(钥匙|门锁|门把|门)/.test(recent)) push("我先检查门锁结构，确认能否快速撤离。");
    if (/(电梯|楼梯|走廊)/.test(recent)) push("我先确认通道哪条更安全，再决定推进。");
  }

  for (const f of fallbacks) {
    if (out.length >= 4) break;
    push(f);
  }
  return out.slice(0, 4);
}

function finalizeOptionsFallbackParsed(parsed: string[]): { ok: true; options: string[] } | null {
  const guarded = guardModelGeneratedOptions(parsed, 4);
  if (guarded.length >= 4) return { ok: true, options: guarded.slice(0, 4) };
  return null;
}

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
        "禁止把选项写成 UI/面板/资料簿操作，例如“查看灵感手记”“检查背包”“打开任务/属性/菜单”“使用道具”。",
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
    // Reasoning models (e.g. MiniMax) need 8-10s for reasoning_content + content.
    // The per-attempt timeout from VC_WAITING (6.5s) is too short; use 15s to avoid
    // aborting mid-reasoning and returning no model-generated options.
    requestTimeoutMs: Math.max(args.timeoutMs, 15_000),
    skipCache: true,
    devOverrides: {
      // Reasoning models spend most tokens on reasoning_content before emitting content.
      // 256 is not enough — the model hits max_tokens with empty content.
      maxTokens: 1024,
      temperature: args.temperature,
      timeoutMs: Math.max(args.timeoutMs, 15_000),
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
   * When hit, skip upstream calls and return conservative padded options.
   *
   * 设计目标：让“补 options”更像低成本工具，而不是第二次长等待。
   */
  budgetMs?: number;
}): Promise<{ ok: true; options: string[] } | { ok: false; reason: string }> {
  const budgetMs = Math.max(0, Math.min(30_000, args.budgetMs ?? 0));
  const t0 = Date.now();
  const remainingMs = () => (budgetMs > 0 ? Math.max(0, budgetMs - (Date.now() - t0)) : Infinity);

  // If budget is too tight, skip any upstream attempt.
  if (budgetMs > 0 && remainingMs() < 350) {
    return { ok: false, reason: "budget_exhausted_before_ai" };
  }

  const tryParse = (content: string): { ok: true; options: string[] } | null => {
    try {
      // Strip markdown code fences that some models wrap around JSON
      const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      const obj = JSON.parse(cleaned) as Record<string, unknown>;
      const parsed = parseOptionsArrayFromAiJson(obj.options ?? (obj as any).decision_options);
      const done = finalizeOptionsFallbackParsed(parsed);
      if (!done) return null;
      return {
        ok: true,
        options: guardOptionsQualityToFour({
          options: done.options,
          playerContext: args.playerContext,
          recentActionHint: args.latestUserInput,
        }),
      };
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

  // When budget is tight (< sum of both attempt timeouts), use single attempt with full budget
  // to maximize chance of one successful AI call. Previous dual-attempt strategy caused the first
  // attempt to consume nearly all budget, leaving the second with insufficient time.
  const canFitBothAttempts = budgetMs <= 0 ||
    budgetMs >= VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs + VC_WAITING.optionsOnlyFallbackAttempt2TimeoutMs + 500;

  const first = await runOptionsOnlyAiOnce({
    ...args,
    temperature: 0.4,
    systemExtra: args.systemExtra,
    timeoutMs: canFitBothAttempts
      ? VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs
      : Math.max(VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs, budgetMs > 0 ? budgetMs - 300 : VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs),
    signal: withBudgetSignal(
      canFitBothAttempts
        ? VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs
        : Math.max(VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs, budgetMs > 0 ? budgetMs - 300 : VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs)
    ),
  });
  if (first.ok) {
    const done = tryParse(first.content);
    if (done) return done;
  }

  if (budgetMs > 0 && remainingMs() < 1500) {
    // 不注入本地罐头选项；客户端可在正文落地后再请求一次纯模型选项生成。
    return { ok: false, reason: first.ok ? "invalid_model_options" : first.reason };
  }

  const second = await runOptionsOnlyAiOnce({
    ...args,
    temperature: 0.65,
    systemExtra: [args.systemExtra ?? "", "若你上次容易少给条目：本次必须输出恰好 4 条 options，不要省略。"].filter(Boolean).join("\n"),
    timeoutMs: VC_WAITING.optionsOnlyFallbackAttempt2TimeoutMs,
    signal: withBudgetSignal(VC_WAITING.optionsOnlyFallbackAttempt2TimeoutMs),
  });
  if (second.ok) {
    const done = tryParse(second.content);
    if (done) return done;
  }

  return { ok: false, reason: second.ok ? "invalid_model_options" : second.reason };
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
      "禁止把选项写成 UI/面板/资料簿操作，例如“查看灵感手记”“检查背包”“打开任务/属性/菜单”“使用道具”。",
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
    requestTimeoutMs: Math.max(args.timeoutMs, 15_000),
    skipCache: true,
    devOverrides: {
      maxTokens: 1024,
      temperature: args.temperature,
      timeoutMs: Math.max(args.timeoutMs, 15_000),
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
  const budgetMs = Math.max(0, Math.min(30_000, args.budgetMs ?? 0));
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
