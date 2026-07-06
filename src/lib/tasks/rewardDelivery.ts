/**
 * 统一奖励发放引擎
 *
 * 集中处理所有类型的任务奖励发放，确保 NPC 颁发的奖励切实到账。
 * 支持原子操作：要么全部发放成功，要么回滚（记录失败项）。
 *
 * 参考开放世界游戏的奖励模式：
 * - 即時奖励（originium、道具）直接到账
 * - 解锁奖励（新区域、新能力）通过 worldFlags 激活
 * - 关系奖励（NPC 好感度变化）写入 codex
 */

import type { GameTaskV2, GameTaskRewardV2 } from "./taskV2";
import type { RelationshipDelta } from "./taskV2";

// === 奖励发放输入/输出 ===

export interface RewardDeliveryInput {
  task: GameTaskV2;
  /** 当前游戏状态（用于检查容量等） */
  gameState: RewardGameState;
}

export interface RewardGameState {
  originium: number;
  inventory: Array<{ id: string; name: string; quantity: number }>;
  warehouse: Array<{ id: string; name: string; quantity: number }>;
  maxInventorySlots: number;
  codexFavorability: Record<string, number>;  // npcId → favorability
  unlockedWorldFlags: string[];
  playerLocation: string;
}

export interface RewardDeliveryResult {
  success: boolean;
  /** 全部发放成功 */
  allDelivered: boolean;
  /** 发放摘要（用于叙事和 UI） */
  summary: string;
  /** 变更后的游戏状态 */
  newState: RewardGameState;
  /** 逐项发放日志 */
  deliveryLog: RewardDeliveryLogEntry[];
  /** 失败项（容量不足、NPC 不存在等） */
  failures: RewardDeliveryFailure[];
}

export interface RewardDeliveryLogEntry {
  type: "originium" | "item" | "warehouse_item" | "unlock" | "relationship" | "codex_note";
  detail: string;
  delivered: boolean;
}

export interface RewardDeliveryFailure {
  type: string;
  reason: string;
  detail: string;
}

// === 奖励发放核心 ===

export function deliverTaskReward(input: RewardDeliveryInput): RewardDeliveryResult {
  const { task, gameState } = input;
  const reward = task.reward;
  const log: RewardDeliveryLogEntry[] = [];
  const failures: RewardDeliveryFailure[] = [];
  let state = { ...gameState, inventory: [...gameState.inventory], warehouse: [...gameState.warehouse], codexFavorability: { ...gameState.codexFavorability }, unlockedWorldFlags: [...gameState.unlockedWorldFlags] };

  // 1. 原石
  if (reward.originium > 0) {
    state.originium += reward.originium;
    log.push({ type: "originium", detail: `+${reward.originium} 原石`, delivered: true });
  }

  // 2. 行囊道具
  for (const itemName of reward.items) {
    const delivered = deliverItem(state, itemName, "inventory");
    if (delivered.ok) {
      state = delivered.state;
      log.push({ type: "item", detail: itemName, delivered: true });
    } else {
      // 行囊满了 → 尝试放入仓库
      const whDelivery = deliverItem(state, itemName, "warehouse");
      if (whDelivery.ok) {
        state = whDelivery.state;
        log.push({ type: "warehouse_item", detail: `${itemName}（行囊满，已放入仓库）`, delivered: true });
      } else {
        failures.push({ type: "item", reason: "inventory_and_warehouse_full", detail: itemName });
        log.push({ type: "item", detail: `${itemName}（发放失败：行囊和仓库均满）`, delivered: false });
      }
    }
  }

  // 3. 仓库道具（直接入仓库）
  for (const itemName of reward.warehouseItems) {
    const delivered = deliverItem(state, itemName, "warehouse");
    if (delivered.ok) {
      state = delivered.state;
      log.push({ type: "warehouse_item", detail: itemName, delivered: true });
    } else {
      failures.push({ type: "warehouse_item", reason: "warehouse_full", detail: itemName });
      log.push({ type: "warehouse_item", detail: `${itemName}（发放失败：仓库满）`, delivered: false });
    }
  }

  // 4. 解锁（worldFlags + 显式解锁）
  for (const unlock of reward.unlocks) {
    if (!state.unlockedWorldFlags.includes(unlock)) {
      state.unlockedWorldFlags.push(unlock);
    }
    log.push({ type: "unlock", detail: unlock, delivered: true });
  }

  // 5. NPC 关系变化
  for (const rel of reward.relationshipChanges) {
    const prev = state.codexFavorability[rel.npcId] ?? 0;
    const delta = rel.value ?? (rel.delta === "trust_up" ? 5 : rel.delta === "trust_down" ? -5 : rel.delta === "betrayal_flag" ? -15 : 2);
    state.codexFavorability[rel.npcId] = Math.max(-50, Math.min(100, prev + delta));
    const actualDelta = state.codexFavorability[rel.npcId]! - prev;
    log.push({
      type: "relationship",
      detail: `${rel.npcId}:${rel.delta}(${actualDelta > 0 ? "+" : ""}${actualDelta})`,
      delivered: true,
    });
  }

  // 6. 构建摘要
  const summaryParts: string[] = [];
  if (reward.originium > 0) summaryParts.push(`原石 +${reward.originium}`);
  const itemsDelivered = log.filter((l) => l.type === "item" && l.delivered).length;
  if (itemsDelivered > 0) summaryParts.push(`道具 ×${itemsDelivered}`);
  const whDelivered = log.filter((l) => l.type === "warehouse_item" && l.delivered).length;
  if (whDelivered > 0) summaryParts.push(`仓库物品 ×${whDelivered}`);
  if (reward.unlocks.length > 0) summaryParts.push(`解锁 ×${reward.unlocks.length}`);
  const relCount = reward.relationshipChanges.length;
  if (relCount > 0) summaryParts.push(`关系变化 ×${relCount}`);

  return {
    success: failures.length === 0,
    allDelivered: failures.length === 0,
    summary: summaryParts.length > 0 ? summaryParts.join("，") : "无实物奖励",
    newState: state,
    deliveryLog: log,
    failures,
  };
}

// === 内部辅助 ===

function deliverItem(
  state: RewardGameState,
  itemName: string,
  target: "inventory" | "warehouse"
): { ok: boolean; state: RewardGameState } {
  const list = target === "inventory" ? state.inventory : state.warehouse;
  const maxSlots = target === "inventory" ? state.maxInventorySlots : 999;

  // 尝试堆叠到已有同名牌
  const existing = list.find((i) => i.name === itemName);
  if (existing) {
    existing.quantity += 1;
    return { ok: true, state };
  }

  // 新道具需要空位
  if (list.length >= maxSlots) {
    return { ok: false, state };
  }

  const newItem = {
    id: `reward_${itemName}_${Date.now()}`,
    name: itemName,
    quantity: 1,
  };

  if (target === "inventory") {
    state.inventory.push(newItem);
  } else {
    state.warehouse.push(newItem);
  }

  return { ok: true, state };
}

// === 批量发放（多任务同时交付） ===

export function deliverMultipleRewards(
  tasks: GameTaskV2[],
  gameState: RewardGameState
): { results: RewardDeliveryResult[]; finalState: RewardGameState } {
  let state = gameState;
  const results: RewardDeliveryResult[] = [];

  for (const task of tasks) {
    const result = deliverTaskReward({ task, gameState: state });
    results.push(result);
    state = result.newState;
  }

  return { results, finalState: state };
}

// === 奖励预览（用于任务板 UI） ===

export function previewReward(reward: GameTaskRewardV2): string[] {
  const lines: string[] = [];
  if (reward.originium > 0) lines.push(`💰 原石 ×${reward.originium}`);
  for (const item of reward.items) lines.push(`📦 ${item}`);
  for (const item of reward.warehouseItems) lines.push(`🏠 ${item}（仓库）`);
  for (const unlock of reward.unlocks) lines.push(`🔓 ${unlock}`);
  for (const rel of reward.relationshipChanges) {
    const delta = rel.delta === "trust_up" ? "↑" : rel.delta === "trust_down" ? "↓" : rel.delta === "betrayal_flag" ? "⚠️" : "↔";
    lines.push(`💬 ${rel.npcId} ${delta}`);
  }
  return lines.length > 0 ? lines : ["📋 线索推进（无实物奖励）"];
}
