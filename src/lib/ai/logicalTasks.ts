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

function asStringArrayOptions(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t) continue;
    if (t.length < 2 || t.length > 40) continue;
    out.push(t);
    if (out.length >= 4) break;
  }
  // De-dupe while preserving order
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
}): Promise<{ ok: true; options: string[] } | { ok: false; reason: string }> {
  const system: ChatMessage = {
    role: "system",
    content: [
      "你是规则怪谈文字冒险的控制面助手，任务是为玩家生成下一步可点击行动选项。",
      "你必须只输出一个 JSON 对象，形如：{\"options\":[\"...\",\"...\",\"...\",\"...\"]}。",
      "严格要求：options 恰好 4 条，中文简体，每条 5–20 字，第一人称行动句，不重复，贴合当前剧情与玩家状态。",
      "禁止输出任何解释、禁止输出 markdown、禁止输出代码块、禁止输出额外字段。",
    ].join("\n"),
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
    requestTimeoutMs: 9_000,
    skipCache: true,
    devOverrides: {
      maxTokens: 256,
      temperature: 0.4,
      timeoutMs: 9_000,
      responseFormatJsonObject: true,
    },
  });

  if (!res.ok) {
    return { ok: false, reason: `ai_error:${res.code}` };
  }

  try {
    const obj = JSON.parse(res.content) as Record<string, unknown>;
    const options = asStringArrayOptions(obj.options);
    if (options.length === 4) return { ok: true, options };
    return { ok: false, reason: "invalid_options_shape" };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
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
