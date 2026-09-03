/**
 * MechanicsWorkflow → TurnCandidate 适配边界。
 * 工具结果仍是候选，注册表守卫会在唯一 TurnFinalizer 提交前再次收口。
 */

import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import type { ChatMessage } from "@/lib/ai/types/core";
import {
  buildMechanicsSystemPromptBlock,
  createMechanicsFailureCandidate,
  MECHANICS_DEFAULT_RUNTIME_LIMITS,
  runMechanicsWorkflow,
} from "@/lib/turnEngine/mechanicsWorkflow";
import type { MechanicsWorkflowResult } from "@/lib/turnEngine/mechanicsWorkflow";
import type { ExecuteChatCompletionFn, ToolRegistry } from "@/lib/ai/tools/runToolLoop";
import type { MechanicsContext, MechanicsExecutionLimits } from "@/lib/ai/tools/mechanicsTypes";
import type { ServerGameState } from "@/lib/ai/tools/mechanicsServerStateAdapter";

const REGISTERED_WAREHOUSE_ITEM_IDS = new Set(WAREHOUSE_ITEMS.map((item) => item.id));

/**
 * Mechanics 回合结果的最小结构形状；本守卫只依赖这三个字段。
 */
export interface MechanicsStateDeltaLite {
  itemsConsumed?: string[];
  itemsGranted?: string[];
}

export interface MechanicsTurnResultLite {
  narrative?: string;
  toolsUsed?: unknown;
  stateDelta?: MechanicsStateDeltaLite | null;
}

/**
 * Mechanics stateDelta → TurnCandidate 的统一映射。
 *
 * 与主链路 registeredMechanicsGuard 使用同一注册表事实源：任何进入最终
 * DM JSON 的物品都必须是已注册 id（道具或仓库物品）。grant_item 工具自身
 * 已做校验（T13），此处是 defense-in-depth 的收口层，未注册 id 被剔除并
 * 记录 `unregistered_item_pruned_v1`，合法注册物品不受影响。
 */
export function buildMechanicsCandidate(turnResult: MechanicsTurnResultLite): Record<string, unknown> {
  const candidate: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: turnResult.narrative || "规则处理已完成。",
    is_death: false,
    consumes_time: true,
    options: [] as string[],
    mechanics_tools_used: turnResult.toolsUsed,
    mechanics_state_delta: turnResult.stateDelta,
  };
  const sd = turnResult.stateDelta;
  if (sd) {
    if (sd.itemsConsumed?.length) candidate.consumed_items = sd.itemsConsumed;
    if (sd.itemsGranted?.length) {
      const granted = sd.itemsGranted.filter(
        (id) => findRegisteredItemById(id) !== undefined || REGISTERED_WAREHOUSE_ITEM_IDS.has(id),
      );
      if (granted.length > 0) candidate.awarded_items = granted.map((id) => ({ id, name: id }));
      if (granted.length !== sd.itemsGranted.length) {
        candidate._commit_flags = ["unregistered_item_pruned_v1"];
      }
    }
  }
  return candidate;
}

// ============================================================
// Public API
// ============================================================

export interface MechanicsRouteInput {
  requestId: string;
  sessionId: string;
  userId?: string | null;
  playerLocation: string;
  worldId: string;
  /** 已构建的系统消息 */
  systemMessages: ChatMessage[];
  /** 用户消息 */
  userMessage: ChatMessage;
  signal?: AbortSignal;
  /** 可选：推送中间状态 */
  onStatus?: (status: string) => void;
  /** 可选：流式叙事回调 */
  /** 服务端游戏状态（用于工具读取真实数据） */
  serverGameState?: ServerGameState;
  /** 测试/组合入口：仍受 MechanicsWorkflow 的统一预算约束。 */
  execute?: ExecuteChatCompletionFn;
  tools?: ToolRegistry;
}

export interface MechanicsRouteOutput {
  result: MechanicsWorkflowResult;
  /** Mechanics 上下文（用于审计） */
  context?: MechanicsContext;
  /** Mechanics 使用的系统提示词片段 */
  systemPromptBlock?: string;
}

/**
 * 运行规范 Mechanics 回合。调用方已经通过 TurnLaneRouter 取得
 * mechanics lane 所有权，因此这里不存在旧路径开关或 Writer 回退。
 */
export async function runMechanicsRoute(
  input: MechanicsRouteInput
): Promise<MechanicsRouteOutput> {
  const limits: MechanicsExecutionLimits = {
    maxToolRounds: MECHANICS_DEFAULT_RUNTIME_LIMITS.maxToolRounds,
    totalBudgetMs: MECHANICS_DEFAULT_RUNTIME_LIMITS.totalBudgetMs,
    perToolTimeoutMs: MECHANICS_DEFAULT_RUNTIME_LIMITS.perToolTimeoutMs,
  };

  const ctx: MechanicsContext = {
    requestId: input.requestId,
    sessionId: input.sessionId,
    userId: input.userId,
    playerLocation: input.playerLocation,
    worldId: input.worldId,
    limits,
    signal: input.signal,
    serverGameState: input.serverGameState,
  };

  const mechanicsPromptBlock = buildMechanicsSystemPromptBlock();

  // 组装消息：system + user input
  const messages: ChatMessage[] = input.systemMessages.map((message) => ({ ...message }));

  if (mechanicsPromptBlock && messages.length > 0) {
    const lastSystem = [...messages].reverse().find((m) => m.role === "system");
    if (lastSystem) {
      lastSystem.content += `\n\n${mechanicsPromptBlock}`;
    }
  }

  messages.push(input.userMessage);

  try {
    const result = await runMechanicsWorkflow({
      ctx,
      messages,
      onStatus: input.onStatus,
      signal: input.signal,
      execute: input.execute,
      tools: input.tools,
    });

    // A valid first response without tools is already the mechanics candidate.
    // Reusing it prevents an unnecessary full Writer call.
    return {
      result,
      context: ctx,
      systemPromptBlock: mechanicsPromptBlock,
    };
  } catch {
    // Mechanics 已取得本回合所有权后不得再转入 Writer；否则两轮
    // Mechanics 失败会产生第三次生成调用。失败候选仍由唯一 Finalizer 收口。
    return {
      result: createMechanicsFailureCandidate(),
      context: ctx,
      systemPromptBlock: mechanicsPromptBlock,
    };
  }
}
