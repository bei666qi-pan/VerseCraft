/**
 * MechanicsWorkflow → TurnCandidate 适配边界。
 * 工具结果仍是候选，注册表守卫会在唯一 TurnFinalizer 提交前再次收口。
 */

import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import { normalizePlayerDmJson } from "@/lib/playRealtime/normalizePlayerDmJson";
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
 * Immediate player-visible prose for the bounded Mechanics lane. It describes
 * only the attempted action and never claims a state change or successful
 * outcome; the authoritative result still comes exclusively from Finalizer.
 */
export function buildMechanicsNarrativePrelude(userInput: string, worldId: string): string {
  const input = userInput.trim();
  if (/装备|武器|飞剑|法宝/u.test(input)) {
    return worldId === "xingni_taichu"
      ? "你查看随身器物，先确认此刻是否真有可以装备的飞剑或法宝。"
      : "你查看随身装备，先确认此刻是否真有可以使用的武器。";
  }
  if (/背包|储物袋|物品|材料|灵石/u.test(input)) {
    return worldId === "xingni_taichu"
      ? "你打开储物袋，逐项核对眼下真实持有的物品与灵石。"
      : "你低头检查随身物品，逐项核对眼下真实持有的东西。";
  }
  if (/任务|委托|悬赏/u.test(input)) {
    return "你先确认现场是否确有可承接的事务，再决定要不要登记下来。";
  }
  if (/修炼|调息|运转灵力|炼丹|炼器/u.test(input)) {
    return "你收敛呼吸，先确认当前环境与自身条件是否允许这次尝试。";
  }
  if (/攻击|应战|迎战|御敌|出手|战斗/u.test(input)) {
    return "你没有贸然出手，而是先确认对手、距离与眼前可用的手段。";
  }
  return "你开始核对这个行动所需的条件，眼前的一切仍以真实状态为准。";
}

/** Partial JSON lets the existing client preview prose without creating a second protocol. */
export function buildMechanicsNarrativePreludeFrame(prelude: string): string {
  const encoded = JSON.stringify(prelude);
  return `{"narrative":${encoded.slice(0, -1)}`;
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

/**
 * Mechanics owns the turn once routed. This seam guarantees a finalizer-ready
 * candidate, so a malformed workflow result can never fall through to Writer.
 */
export function buildNormalizedMechanicsCandidate(
  turnResult: MechanicsTurnResultLite,
): NonNullable<ReturnType<typeof normalizePlayerDmJson>> {
  const normalized = normalizePlayerDmJson(buildMechanicsCandidate(turnResult));
  if (normalized) return normalized;

  // Defense in depth: keep the player on the single Mechanics -> Finalizer
  // path even if candidate normalization regresses in a future change.
  const failure = normalizePlayerDmJson({
    is_action_legal: false,
    illegal_reason: "规则处理暂时不可用，请稍后重试。",
    sanity_damage: 0,
    narrative: "这次操作暂时无法完成，请检查当前资源和条件后重试。",
    is_death: false,
    consumes_time: false,
    options: [],
  });
  if (!failure) throw new Error("mechanics_failure_candidate_normalization_failed");
  return failure;
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
