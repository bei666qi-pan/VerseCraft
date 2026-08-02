// src/lib/ai/tools/dmAgentRouteIntegration.ts
/**
 * DM Agent Route Integration
 * 
 * 轻量级集成层，用于在 /api/chat 路由中接入 DM Agent。
 * 
 * 设计原则：
 * - 通过 Feature Flag 控制，默认关闭
 * - 失败时自动回退到旧 DM 路径
 * - 不破坏现有 SSE 契约
 * - 不增加首包延迟
 * - 不绕过 final hooks (validator/resolve/commit 链)
 * 
 * FIXED (2025-07-24):
 * - 返回 DmAgentTurnResult 供状态合并
 * - 路由层不再自行构造 DM JSON 并直接输出 __VERSECRAFT_FINAL__
 */

import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import {
  runDmAgentTurn,
  buildDmAgentSystemPromptBlock,
  DEFAULT_FLAGS,
} from "./dmAgentOrchestrator";
import type { DmAgentTurnResult } from "./dmAgentTypes";
import type { DmAgentContext, DmAgentFeatureFlags } from "./dmAgentTypes";
import type { ServerGameState } from "./dmServerStateAdapter";
import type { ChatMessage } from "@/lib/ai/types/core";

const REGISTERED_WAREHOUSE_ITEM_IDS = new Set(WAREHOUSE_ITEMS.map((item) => item.id));

/**
 * DM-agent stateDelta → DM JSON 的统一映射。
 *
 * 与主链路 registeredMechanicsGuard 使用同一注册表事实源：任何进入最终
 * DM JSON 的物品都必须是已注册 id（道具或仓库物品）。grant_item 工具自身
 * 已做校验（T13），此处是 defense-in-depth 的收口层，未注册 id 被剔除并
 * 记录 `unregistered_item_pruned_v1`，合法注册物品不受影响。
 */
export function buildDmAgentDmJson(turnResult: DmAgentTurnResult): Record<string, unknown> {
  const dmJson: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: turnResult.narrative || "（DM Agent 处理完成）",
    is_death: false,
    consumes_time: true,
    options: [] as string[],
    dm_agent_tools_used: turnResult.toolsUsed,
    dm_agent_state_delta: turnResult.stateDelta,
  };
  const sd = turnResult.stateDelta;
  if (sd) {
    if (sd.itemsConsumed?.length) dmJson.consumed_items = sd.itemsConsumed;
    if (sd.itemsGranted?.length) {
      const granted = sd.itemsGranted.filter(
        (id) => findRegisteredItemById(id) !== undefined || REGISTERED_WAREHOUSE_ITEM_IDS.has(id),
      );
      if (granted.length > 0) dmJson.awarded_items = granted.map((id) => ({ id, name: id }));
      if (granted.length !== sd.itemsGranted.length) {
        dmJson._commit_flags = ["unregistered_item_pruned_v1"];
      }
    }
  }
  return dmJson;
}

// ============================================================
// Public API
// ============================================================

export interface DmAgentRouteInput {
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
  /** 可选：覆盖 feature flag（用于测试） */
  forceEnabled?: boolean;
  /** 服务端游戏状态（用于工具读取真实数据） */
  serverGameState?: ServerGameState;
}

export interface DmAgentRouteOutput {
  /** Agent 是否被使用（false = 回退到旧 DM） */
  agentUsed: boolean;
  /** Agent 增强结果（如果 agentUsed = true），含 turnResult + toolResultData */
  result?: DmAgentTurnResult;
  /** Agent 上下文（用于审计） */
  context?: DmAgentContext;
  /** Agent 使用的系统提示词片段 */
  systemPromptBlock?: string;
}

/**
 * 尝试运行 DM Agent 回合
 * 
 * 如果 feature flag 启用且 Agent 成功处理，返回 agentUsed=true。
 * 否则返回 agentUsed=false，调用方应回退到旧 DM 路径。
 */
export async function tryRunDmAgentTurn(
  input: DmAgentRouteInput
): Promise<DmAgentRouteOutput> {
  const flags = getVerseCraftRolloutFlags();

  // Feature flag gate
  const enabled = input.forceEnabled ?? flags.enableDmAgent;
  if (!enabled) {
    return { agentUsed: false };
  }

  const agentFlags: DmAgentFeatureFlags = {
    dmAgentEnabled: true,
    maxToolRounds: DEFAULT_FLAGS.maxToolRounds,
    totalBudgetMs: DEFAULT_FLAGS.totalBudgetMs,
    perToolTimeoutMs: DEFAULT_FLAGS.perToolTimeoutMs,
  };

  const ctx: DmAgentContext = {
    requestId: input.requestId,
    sessionId: input.sessionId,
    userId: input.userId,
    playerLocation: input.playerLocation,
    worldId: input.worldId,
    flags: agentFlags,
    signal: input.signal,
    serverGameState: input.serverGameState,
  };

  // 构建 Agent 专用提示词
  const agentPromptBlock = buildDmAgentSystemPromptBlock(agentFlags);

  // 组装消息：system + user input
  const messages: ChatMessage[] = [...input.systemMessages];

  // 如果有 Agent 指令，追加到最后一个 system 消息
  if (agentPromptBlock && messages.length > 0) {
    const lastSystem = [...messages].reverse().find((m) => m.role === "system");
    if (lastSystem) {
      lastSystem.content += `\n\n${agentPromptBlock}`;
    }
  }

  messages.push(input.userMessage);

  try {
    const result = await runDmAgentTurn({
      flags: agentFlags,
      ctx,
      messages,
      onStatus: input.onStatus,
      signal: input.signal,
    });

    if (result) {
      return {
        agentUsed: true,
        result,
        context: ctx,
        systemPromptBlock: agentPromptBlock,
      };
    }
  } catch {
    // Agent 失败，静默回退到旧 DM
  }

  return { agentUsed: false };
}

/**
 * 检查 DM Agent 是否可用
 */
export function isDmAgentAvailable(): boolean {
  const flags = getVerseCraftRolloutFlags();
  return flags.enableDmAgent;
}

/**
 * 获取 DM Agent 配置（用于调试和监控）
 */
export function getDmAgentConfig(): {
  enabled: boolean;
  maxToolRounds: number;
  totalBudgetMs: number;
  perToolTimeoutMs: number;
} {
  const flags = getVerseCraftRolloutFlags();
  return {
    enabled: flags.enableDmAgent,
    maxToolRounds: DEFAULT_FLAGS.maxToolRounds,
    totalBudgetMs: DEFAULT_FLAGS.totalBudgetMs,
    perToolTimeoutMs: DEFAULT_FLAGS.perToolTimeoutMs,
  };
}
