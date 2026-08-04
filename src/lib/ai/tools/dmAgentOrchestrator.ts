// src/lib/ai/tools/dmAgentOrchestrator.ts
/**
 * DM Agent Orchestrator
 * 
 * 协调 DM Agent 的工具调用循环。
 * 
 * 执行模式：
 * 1. 模型接收玩家输入 + 上下文字段
 * 2. 模型决定：直接叙事 / 调用工具 / 询问玩家
 * 3. 0～N 个工具调用 → 服务端验证并执行
 * 4. 一次最终叙事输出
 * 
 * 硬限制：
 * - 默认最多 2 轮工具决策
 * - 绝对上限 3 轮
 * - 总预算 30 秒
 * - 单工具超时 3 秒
 * - 禁止无上限 Agent Loop
 * 
 * FIXED (2025-07-24):
 * - executeDmTool 中 args 变量未定义，现已通过 parseToolArguments 解析 call.function.arguments
 * - 新增 toolResultData 收集，用于状态合并
 * - 工具参数现在经过 JSON.parse 校验
 */

import { executeChatCompletion } from "@/lib/ai/router/execute";
import type {
  ChatMessage,
  ToolCall,
  TaskType,
} from "@/lib/ai/types/core";
import type { } from "@/lib/ai/types";
import {
  DM_TOOL_REGISTRY,
  getDmToolDefinitions,
} from "./dmToolHandlers";
import {
  getCachedToolResult,
  setCachedToolResult,
} from "./dmToolCache";
import {
  DM_AGENT_TOOL_INSTRUCTIONS,
  DM_AGENT_DEFAULTS,
  type DmAgentContext,
  type DmAgentTurnResult,
  type DmToolCallTrace,
  type DmAgentStateDelta,
  type DmAgentFeatureFlags,
} from "./dmAgentTypes";
import { READONLY_DM_TOOL_NAMES } from "./dmToolSchemas";
import type { DmToolResult } from "./dmAgentTypes";

/** 只读工具名称集合（用于快速查找） */
const READONLY_DM_TOOL_NAMES_SET = new Set<string>(READONLY_DM_TOOL_NAMES);

// ============================================================
// Configuration
// ============================================================

const DEFAULT_FLAGS: DmAgentFeatureFlags = {
  dmAgentEnabled: false,
  maxToolRounds: DM_AGENT_DEFAULTS.MAX_TOOL_ROUNDS,
  totalBudgetMs: DM_AGENT_DEFAULTS.TOTAL_BUDGET_MS,
  perToolTimeoutMs: DM_AGENT_DEFAULTS.PER_TOOL_TIMEOUT_MS,
};

// ============================================================
// Public API
// ============================================================

export interface DmAgentOptions {
  flags: DmAgentFeatureFlags;
  ctx: DmAgentContext;
  /** 初始消息列表（system prompt + user input） */
  messages: ChatMessage[];
  /** 流式回调（可选，用于推送中间状态给 SSE） */
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}

/**
 * 运行 DM Agent 工具调用循环
 * 
 * 返回最终的叙事文本和工具调用追踪。
 * 如果 dmAgentEnabled 为 false 或没有工具被调用，返回 null 表示应使用普通 DM 路径。
 */
export async function runDmAgentTurn(options: DmAgentOptions): Promise<DmAgentTurnResult | null> {
  const { flags, ctx, messages, onStatus, signal } = options;
  const t0 = Date.now();

  // Feature flag gate
  if (!flags.dmAgentEnabled) {
    return null;
  }

  const toolDefinitions = getDmToolDefinitions();
  if (toolDefinitions.length === 0) {
    return null;
  }

  const maxRounds = Math.min(
    flags.maxToolRounds || DM_AGENT_DEFAULTS.MAX_TOOL_ROUNDS,
    DM_AGENT_DEFAULTS.MAX_TOOL_ROUNDS_HARD_CAP
  );
  const totalBudgetMs = flags.totalBudgetMs || DM_AGENT_DEFAULTS.TOTAL_BUDGET_MS;
  const perToolTimeoutMs = flags.perToolTimeoutMs || DM_AGENT_DEFAULTS.PER_TOOL_TIMEOUT_MS;

  const trace: DmToolCallTrace[] = [];
  const toolResultData: { toolName: string; ok: boolean; data: unknown }[] = [];

  const stateDelta: DmAgentStateDelta = {
    questsIssued: 0,
    questsUpdated: 0,
    itemsConsumed: [],
    itemsGranted: [],
    weaponsForged: [],
    combatResolved: false,
    worldEventsApplied: 0,
  };

  const transcript: ChatMessage[] = [...messages];

  let lastNarrative = "";
  let toolsUsed = false;

  for (let round = 1; round <= maxRounds; round++) {
    if (signal?.aborted) break;

    const budgetLeft = totalBudgetMs - (Date.now() - t0);
    if (budgetLeft < 1500) break; // 不足 1.5 秒，放弃继续

    const isFinalRound = round === maxRounds;

    onStatus?.(`dm_agent_round_${round}`);

    try {
      const response = await executeChatCompletion({
        task: "DM_AGENT" as TaskType,
        messages: transcript,
        ctx: {
          requestId: ctx.requestId,
          task: "DM_AGENT" as TaskType,
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          path: "/api/chat",
          tags: { dmAgentRound: round },
        },
        signal,
        requestTimeoutMs: Math.min(budgetLeft, 15000),
        skipCache: true,
        tools: toolDefinitions,
        toolChoice: isFinalRound ? "none" : "auto",
      });

      if (!response.ok) {
        // AI 调用失败，降级：返回已有叙事
        break;
      }

      const toolCalls = response.toolCalls ?? [];

      if (toolCalls.length === 0) {
        // 模型决定不调用工具 → 直接叙事
        lastNarrative = response.content ?? "";
        break;
      }

      toolsUsed = true;

      // 处理工具调用（T14: 只读并行，写串行；T15: AbortSignal 穿透）
      const acceptedCalls = toolCalls.slice(0, 4);
      transcript.push({
        role: "assistant",
        content: response.content ?? "",
        toolCalls: acceptedCalls,
      });

      // 分离只读和写工具
      const readCalls = acceptedCalls.filter((c) =>
        READONLY_DM_TOOL_NAMES_SET.has(c.function.name)
      );
      const writeCalls = acceptedCalls.filter(
        (c) => !READONLY_DM_TOOL_NAMES_SET.has(c.function.name)
      );

      // 限制：每轮最多 1 个写工具
      const effectiveWriteCalls = writeCalls.slice(0, 1);

      // Phase 1: 并行执行所有只读工具
      if (readCalls.length > 0) {
        if (signal?.aborted) break;
        onStatus?.("dm_agent_reading_state");
        const readResults = await Promise.all(
          readCalls.map((call) =>
            executeDmTool(call, ctx, perToolTimeoutMs, onStatus, signal)
          )
        );
        for (let i = 0; i < readCalls.length; i++) {
          const call = readCalls[i];
          const toolResult = readResults[i];
          const latencyMs = toolResult._latencyMs ?? 0;

          trace.push({
            toolName: call.function.name,
            ok: toolResult.ok,
            latencyMs,
            error: toolResult.ok ? undefined : toolResult.error,
          });

          toolResultData.push({
            toolName: call.function.name,
            ok: toolResult.ok,
            data: toolResult.ok ? toolResult.data : null,
          });

          updateStateDelta(stateDelta, call.function.name, toolResult);

          transcript.push({
            role: "tool",
            content: JSON.stringify(toolResult),
            toolCallId: call.id,
          });
        }
      }

      // Phase 2: 串行执行写工具（最多 1 个）
      for (const call of effectiveWriteCalls) {
        if (signal?.aborted) break;
        const toolT0 = Date.now();
        const toolResult = await executeDmTool(call, ctx, perToolTimeoutMs, onStatus, signal);
        const latencyMs = Date.now() - toolT0;

        trace.push({
          toolName: call.function.name,
          ok: toolResult.ok,
          latencyMs,
          error: toolResult.ok ? undefined : toolResult.error,
        });

        toolResultData.push({
          toolName: call.function.name,
          ok: toolResult.ok,
          data: toolResult.ok ? toolResult.data : null,
        });

        updateStateDelta(stateDelta, call.function.name, toolResult);

        transcript.push({
          role: "tool",
          content: JSON.stringify(toolResult),
          toolCallId: call.id,
        });
      }

      // 如果是最后一轮，让模型生成最终叙事
      if (isFinalRound) {
        onStatus?.("dm_agent_final_narrative");
        try {
          const finalResponse = await executeChatCompletion({
            task: "DM_AGENT" as TaskType,
            messages: transcript,
            ctx: {
              requestId: ctx.requestId,
              task: "DM_AGENT" as TaskType,
              userId: ctx.userId,
              sessionId: ctx.sessionId,
              path: "/api/chat",
              tags: { dmAgentFinal: true },
            },
            signal,
            requestTimeoutMs: Math.min(budgetLeft, 15000),
            skipCache: true,
            tools: toolDefinitions,
            toolChoice: "none",
          });

          if (finalResponse.ok && finalResponse.content) {
            lastNarrative = finalResponse.content;
          }
        } catch {
          // 最终叙事失败，使用工具结果拼接
          lastNarrative = buildFallbackNarrative(trace);
        }
        break;
      }
    } catch (e) {
      // 模型调用异常
      trace.push({
        toolName: "_model_error_",
        ok: false,
        latencyMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      });
      break;
    }
  }

  // 如果没有工具被调用，返回 null（回退到普通 DM 路径）
  if (!toolsUsed && !lastNarrative.trim()) {
    return null;
  }

  const turnResult: DmAgentTurnResult = {
    narrative: lastNarrative || buildFallbackNarrative(trace),
    toolTrace: trace,
    stateDelta,
    toolsUsed,
    totalLatencyMs: Date.now() - t0,
  };

  return turnResult;
}

// ============================================================
// Internal Helpers
// ============================================================

/** 解析工具参数为 JSON object，失败返回 null */
function parseToolArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

async function executeDmTool(
  call: ToolCall,
  ctx: DmAgentContext,
  timeoutMs: number,
  onStatus?: (status: string) => void,
  signal?: AbortSignal
): Promise<DmToolResult & { _latencyMs?: number }> {
  const t0 = Date.now();
  const toolName = call.function.name;

  // T15: AbortSignal 检查 — 在执行前检查是否已取消
  if (signal?.aborted) {
    return {
      ok: false,
      error: "操作已取消",
      code: "timeout",
      narrativeContext: "操作已取消",
      _latencyMs: Date.now() - t0,
    };
  }

  const registration = DM_TOOL_REGISTRY[toolName];

  if (!registration) {
    return {
      ok: false,
      error: `未知工具：${toolName}`,
      code: "validation_error",
      narrativeContext: "系统不支持此操作",
      _latencyMs: Date.now() - t0,
    };
  }

  // 解析并校验工具参数（修复: args 之前未定义）
  const args = parseToolArguments(call.function.arguments);
  if (args === null) {
    return {
      ok: false,
      error: "工具参数格式无效",
      code: "validation_error",
      narrativeContext: "系统无法解析操作参数",
      _latencyMs: Date.now() - t0,
    };
  }

  // 缓存检查（仅只读工具）
  if (registration.meta.readonly) {
    const cached = getCachedToolResult(toolName, args);
    if (cached) {
      return { ...cached, _latencyMs: Date.now() - t0 };
    }
  }

  onStatus?.(`dm_tool_${toolName}`);

  // 带超时的执行
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      registration.handler(args, ctx),
      new Promise<DmToolResult>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("tool_timeout")),
          Math.max(1, registration.meta.timeoutMs || timeoutMs)
        );
      }),
    ]);
    // 缓存写入（仅只读工具的成功结果）
    if (registration.meta.readonly && result.ok) {
      setCachedToolResult(toolName, args, result);
    }
    return { ...result, _latencyMs: Date.now() - t0 };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "工具执行异常",
      code: "timeout",
      narrativeContext: "操作超时，请稍后重试",
      _latencyMs: Date.now() - t0,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function updateStateDelta(
  delta: DmAgentStateDelta,
  toolName: string,
  result: DmToolResult
): void {
  if (!result.ok) return;

  switch (toolName) {
    case "issue_quest":
      delta.questsIssued += 1;
      break;
    case "update_quest_progress":
      delta.questsUpdated += 1;
      break;
    case "consume_materials": {
      const data = result.data as { consumedItems?: string[] } | undefined;
      if (data?.consumedItems) delta.itemsConsumed.push(...data.consumedItems);
      break;
    }
    case "grant_item": {
      const data = result.data as { itemId?: string } | undefined;
      if (data?.itemId) delta.itemsGranted.push(data.itemId);
      break;
    }
    case "forge_weapon": {
      const data = result.data as { weaponName?: string } | undefined;
      if (data?.weaponName) delta.weaponsForged.push(data.weaponName);
      break;
    }
    case "resolve_combat_action":
      delta.combatResolved = true;
      break;
    case "apply_world_event":
      delta.worldEventsApplied += 1;
      break;
  }
}

/** 从工具追踪构建降级叙事 */
function buildFallbackNarrative(trace: DmToolCallTrace[]): string {
  if (trace.length === 0) return "（系统处理中，请稍后重试）";

  const successCount = trace.filter((t) => t.ok).length;
  const failCount = trace.filter((t) => !t.ok).length;

  if (failCount > 0 && successCount === 0) {
    return "操作未能完成。请检查你的资源和条件后重试。";
  }

  return "操作已完成。";
}

// ============================================================
// DM Agent Prompt Builder
// ============================================================

/** 构建 DM Agent 专用的 System Prompt 片段 */
export function buildDmAgentSystemPromptBlock(featureFlags: DmAgentFeatureFlags): string {
  if (!featureFlags.dmAgentEnabled) return "";

  return DM_AGENT_TOOL_INSTRUCTIONS;
}

export { DEFAULT_FLAGS };
