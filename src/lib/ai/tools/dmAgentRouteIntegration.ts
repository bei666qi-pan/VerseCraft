// src/lib/ai/tools/dmAgentRouteIntegration.ts
/**
 * DM Agent → DM JSON 映射的统一注册表门禁。
 *
 * 本模块只保留注册表收口函数 `buildDmAgentDmJson`：DM-agent 回合的
 * stateDelta.itemsGranted 必须先经过与主链路 registeredMechanicsGuard 相同
 * 的注册表事实源校验，未注册 id 被剔除并记录 `unregistered_item_pruned_v1`，
 * 合法注册物品不受影响。
 *
 * DM-agent route 接线（tryRunDmAgentTurn / feature flag / orchestrator）属于
 * integrate-bounded-dm-agent-tools 特性流，未随本分支提交；该特性落地时应
 * 复用本函数完成最终 DM JSON 映射。
 */

import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import type { ChatMessage } from "@/lib/ai/types/core";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import { buildDmAgentSystemPromptBlock, DEFAULT_FLAGS, runDmAgentTurn } from "./dmAgentOrchestrator";
import type { DmAgentContext, DmAgentFeatureFlags, DmAgentTurnResult } from "./dmAgentTypes";
import type { ServerGameState } from "./dmServerStateAdapter";

const REGISTERED_WAREHOUSE_ITEM_IDS = new Set(WAREHOUSE_ITEMS.map((item) => item.id));

/**
 * DM-agent 回合结果的最小结构形状（结构化子集）。
 * 完整 DmAgentTurnResult 由 dmAgent 特性流定义；本守卫只依赖这三个字段。
 */
export interface DmAgentStateDeltaLite {
  itemsConsumed?: string[];
  itemsGranted?: string[];
  [key: string]: unknown;
}

export interface DmAgentTurnResultLite {
  narrative?: string;
  toolsUsed?: unknown;
  stateDelta?: DmAgentStateDeltaLite | null;
  [key: string]: unknown;
}

/**
 * DM-agent stateDelta → DM JSON 的统一映射。
 *
 * 与主链路 registeredMechanicsGuard 使用同一注册表事实源：任何进入最终
 * DM JSON 的物品都必须是已注册 id（道具或仓库物品）。grant_item 工具自身
 * 已做校验（T13），此处是 defense-in-depth 的收口层，未注册 id 被剔除并
 * 记录 `unregistered_item_pruned_v1`，合法注册物品不受影响。
 */
export function buildDmAgentDmJson(turnResult: DmAgentTurnResultLite): Record<string, unknown> {
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

    if (result && result.toolsUsed) {
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
