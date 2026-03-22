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
