/**
 * 逻辑任务层：业务与玩法只应依赖本模块的语义入口，不直接调用 execute*、不绑定厂商模型。
 * 内核仍为 TaskType + taskPolicy + execute + 后台管理的 OpenAI 兼容服务。
 * （不设 `server-only`，以便 Node 单测加载；服务端业务请通过 `@/lib/ai/service` 再导出使用。）
 */

import { executeChatCompletion, executePlayerChatStream } from "@/lib/ai/router/execute";
import type { PlayerChatStreamResult } from "@/lib/ai/router/execute";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { AIRequestContext, ChatMessage, TaskType } from "@/lib/ai/types/core";
import type { TaskBinding } from "@/lib/ai/tasks/taskPolicy";
import type { AIResponse, AIErrorResponse } from "@/lib/ai/types";
import type { ControlPreflightResult } from "@/lib/playRealtime/controlPreflight";
import type { PlayerRuleSnapshot } from "@/lib/playRealtime/types";
import type { GameLanguage } from "@/lib/i18n/language";
import {
  parseLocalizedGameplayPresentation,
  parseLocalizedStoryEntries,
  parseLocalizedTaskTexts,
  type LocalizedGameplayPresentation,
  type LocalizedStoryEntry,
  type LocalizableTaskText,
} from "@/lib/i18n/gameplayPresentation";

/** 主叙事 / 玩家 SSE：固定 PLAYER_CHAT，由用途路由解析后台模型候选。 */
export async function generateMainReply(params: {
  messages: ChatMessage[];
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  timeoutMs?: number;
  skipRoles?: readonly AiLogicalRole[];
  maxTokensOverride?: number;
  maxProviderCalls?: number;
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
    maxProviderCalls: params.maxProviderCalls,
  });
}

/**
 * Writer 回合（Phase 2: 唯一玩家可见叙事责任主体）。
 *
 * Writer 负责：
 * - PLAYER_CHAT 玩家可见正文
 * - 已裁决 mechanics 结果的文学呈现
 * - 场景增强、情绪润色等玩家可见修辞能力
 *
 * Writer 不负责：
 * - 意图分类和风险 lane（control）
 * - 安全政策裁决
 * - 伤害、奖励、掉落、任务状态等领域规则（domain services）
 * - 提交 StateDelta 或写 FINAL
 * - 后台世界推演（reasoner）
 *
 * 配置：后台“玩家故事生成”用途的主用与备用顺序。
 * 此为 `generateMainReply` 的语义别名，当前委托同一实现。
 */
export async function generateWriterTurn(params: {
  messages: ChatMessage[];
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  timeoutMs?: number;
  skipRoles?: readonly AiLogicalRole[];
  maxTokensOverride?: number;
}): Promise<PlayerChatStreamResult> {
  return generateMainReply(params);
}

/** 控制面：意图、槽位、风险标签、增强开关（无剧情正文）。内部任务 PLAYER_CONTROL_PREFLIGHT。 */
export async function parsePlayerIntent(args: {
  latestUserInput: string;
  playerContext: string;
  ruleSnapshot: PlayerRuleSnapshot;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path">;
  signal?: AbortSignal;
  budgetMs?: number;
  executionStrategy?: "prefer_fast_path" | "require_model";
}): Promise<ControlPreflightResult> {
  const { runPlayerControlPreflight } = await import("@/lib/playRealtime/controlPreflight");
  return runPlayerControlPreflight(args);
}

export type { ControlPreflightResult } from "@/lib/playRealtime/controlPreflight";

/** Translate player-visible copy after an explicit language switch. Never changes game state. */
export async function localizeGameplayPresentation(args: {
  narrative: string;
  options: string[];
  language: GameLanguage;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
}): Promise<{ ok: true; value: LocalizedGameplayPresentation } | { ok: false; reason: string }> {
  const expectedOptionCount = Math.min(4, Math.max(0, args.options.length));
  const target = args.language === "en-US" ? "English" : "Simplified Chinese";
  const system: ChatMessage = {
    role: "system",
    content: [
      "You localize an already-resolved VerseCraft scene for display only. Do not decide, add, remove, or imply any game-state change.",
      "请严格以 JSON 格式输出，且只能输出一个 JSON 对象：{\"narrative\":\"...\",\"options\":[\"...\"]}。",
      `Translate every player-facing sentence into ${target}. Translate Chinese personal names into readable Latin transliterations when the target is English; do not leave Chinese characters in English output. Keep identifiers such as B1 unchanged.`,
      `Keep exactly ${expectedOptionCount} options, in the same order and with the same intent. Do not add explanations, markdown, fields, facts, or choices.`,
    ].join("\n"),
  };
  const user: ChatMessage = {
    role: "user",
    content: JSON.stringify({ narrative: String(args.narrative ?? "").slice(0, 6_000), options: args.options.slice(0, 4) }),
  };
  const result: AIResponse | AIErrorResponse = await executeChatCompletion({
    task: "GAMEPLAY_LOCALIZATION",
    messages: [system, user],
    ctx: {
      requestId: args.ctx.requestId,
      task: "GAMEPLAY_LOCALIZATION",
      userId: args.ctx.userId,
      sessionId: args.ctx.sessionId,
      path: args.ctx.path,
      tags: { ...(args.ctx.tags ?? {}), purpose: "language_switch" },
    },
    signal: args.signal,
    requestTimeoutMs: 18_000,
    skipCache: true,
  });
  if (!result.ok) return { ok: false, reason: `ai_error:${result.code}` };
  const parsed = parseLocalizedGameplayPresentation(result.content, args.language, expectedOptionCount);
  return parsed.ok ? { ok: true, value: parsed.value } : parsed;
}

/** Translate a bounded set of already-rendered timeline entries after an explicit language switch. */
export async function localizeGameplayHistory(args: {
  entries: LocalizedStoryEntry[];
  language: GameLanguage;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
}): Promise<{ ok: true; value: LocalizedStoryEntry[] } | { ok: false; reason: string }> {
  const entries = args.entries
    .filter((entry) => Number.isInteger(entry.index) && typeof entry.content === "string" && entry.content.trim())
    .slice(0, 6)
    .map((entry) => ({ index: entry.index, content: entry.content.trim().slice(0, 4_000) }));
  if (entries.length === 0) return { ok: true, value: [] };
  const target = args.language === "en-US" ? "English" : "Simplified Chinese";
  const result: AIResponse | AIErrorResponse = await executeChatCompletion({
    task: "GAMEPLAY_LOCALIZATION",
    messages: [
      {
        role: "system",
        content: [
          "You localize already-rendered VerseCraft timeline entries for display only. Do not decide, add, remove, or imply any game-state change.",
          "请严格以 JSON 格式输出，且只能输出一个 JSON 对象：{\"entries\":[{\"index\":0,\"content\":\"...\"}]}。",
          `Translate every entry into ${target}. Preserve every index exactly once and in the supplied order.`,
          "When the target is English, do not leave Chinese characters; transliterate personal names into readable Latin text. Keep identifiers such as B1 unchanged.",
          "Do not add explanations, markdown, fields, facts, or choices.",
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify({ entries }) },
    ],
    ctx: {
      requestId: args.ctx.requestId,
      task: "GAMEPLAY_LOCALIZATION",
      userId: args.ctx.userId,
      sessionId: args.ctx.sessionId,
      path: args.ctx.path,
      tags: { ...(args.ctx.tags ?? {}), purpose: "language_history" },
    },
    signal: args.signal,
    requestTimeoutMs: 18_000,
    skipCache: true,
  });
  if (!result.ok) return { ok: false, reason: `ai_error:${result.code}` };
  const parsed = parseLocalizedStoryEntries(result.content, args.language, entries);
  return parsed.ok ? { ok: true, value: parsed.value } : parsed;
}

/** Translate only player-facing task text after an explicit language switch. Never changes task mechanics. */
export async function localizeGameplayTasks(args: {
  tasks: LocalizableTaskText[];
  language: GameLanguage;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
}): Promise<{ ok: true; value: LocalizableTaskText[] } | { ok: false; reason: string }> {
  const tasks = args.tasks
    .filter((task) => typeof task.id === "string" && task.id.trim() && Object.keys(task.fields ?? {}).length > 0)
    .slice(0, 4)
    .map((task) => ({ id: task.id.trim(), fields: task.fields }));
  if (tasks.length === 0) return { ok: true, value: [] };
  const target = args.language === "en-US" ? "English" : "Simplified Chinese";
  const result: AIResponse | AIErrorResponse = await executeChatCompletion({
    task: "GAMEPLAY_LOCALIZATION",
    messages: [
      {
        role: "system",
        content: [
          "You localize VerseCraft task display copy only. Do not alter task IDs, mechanics, requirements, rewards, status, deadlines, or implied game-state changes.",
          "请严格以 JSON 格式输出，且只能输出一个 JSON 对象：{\"tasks\":[{\"id\":\"...\",\"fields\":{\"title\":\"...\"}}]}。",
          `Translate every supplied task text field into ${target}. Return every supplied task ID exactly once and preserve the exact supplied text-field keys for each task.`,
          "When the target is English, do not leave Chinese characters; transliterate personal names into readable Latin text. Keep canonical IDs such as N-001 and B1 unchanged.",
          "Do not add explanations, markdown, fields, tasks, facts, or choices.",
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify({ tasks }) },
    ],
    ctx: {
      requestId: args.ctx.requestId,
      task: "GAMEPLAY_LOCALIZATION",
      userId: args.ctx.userId,
      sessionId: args.ctx.sessionId,
      path: args.ctx.path,
      tags: { ...(args.ctx.tags ?? {}), purpose: "language_task_text" },
    },
    signal: args.signal,
    requestTimeoutMs: 18_000,
    skipCache: true,
  });
  if (!result.ok) return { ok: false, reason: `ai_error:${result.code}` };
  const parsed = parseLocalizedTaskTexts(result.content, args.language, tasks);
  return parsed.ok ? { ok: true, value: parsed.value } : parsed;
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
  extraBody?: Record<string, unknown>;
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
    extraBody: params.extraBody,
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
