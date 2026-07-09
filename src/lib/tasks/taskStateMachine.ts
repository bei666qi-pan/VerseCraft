/**
 * 任务状态机 — 统一转移守卫
 *
 * 2026-07 重构：移除死代码 QuestState，改用 GameTaskStatus 作为唯一事实源。
 * 提供 canTransitionStatus + checkStatusTransition 供 store 生产路径使用。
 */

import type { GameTaskV2, GameTaskStatus } from "./taskV2";

// === 转移合法性表 ===

const VALID_TRANSITIONS: Record<GameTaskStatus, GameTaskStatus[]> = {
  hidden: ["available", "active"],
  available: ["active", "completed", "failed"],
  active: ["completed", "failed"],
  completed: [],   // 终态，不可逆
  failed: [],      // 终态，不可逆
};

/** 纯函数：检查状态转移是否合法 */
export function canTransitionStatus(from: GameTaskStatus, to: GameTaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** 是否为终态（completed/failed 不可逆） */
export function isTerminalStatus(status: GameTaskStatus): boolean {
  return status === "completed" || status === "failed";
}

// === 转移守卫 ===

export interface StatusTransitionCheck {
  allowed: boolean;
  blockedReason?: string;
  /** 遥测用 consistency flag 名 */
  flag?: string;
}

/**
 * 统一状态转移守卫。
 * 纯函数，无副作用。先查终态锁，再查合法性表。
 */
export function checkStatusTransition(
  task: GameTaskV2,
  toStatus: GameTaskStatus
): StatusTransitionCheck {
  const from = task.status;

  // 终态锁：completed/failed 不可修改
  if (isTerminalStatus(from) && from !== toStatus) {
    return { allowed: false, blockedReason: "terminal_status_locked", flag: "task_illegal_transition_blocked" };
  }

  if (!canTransitionStatus(from, toStatus)) {
    return { allowed: false, blockedReason: `invalid_transition:${from}→${toStatus}`, flag: "task_illegal_transition_blocked" };
  }

  return { allowed: true };
}

// === 向后兼容类型（eval 领地仍引用） ===

/** @deprecated 直接用 GameTaskStatus。为 eval 向后兼容保留。 */
export type QuestState = GameTaskStatus;

/** @deprecated 状态转换事件（不再从生产路径产生，仅保留类型定义） */
export interface QuestTransition {
  from: QuestState;
  to: QuestState;
  taskId: string;
  taskTitle: string;
  reason: string;
  timestamp: number;
}

export interface QuestTransitionResult {
  allowed: boolean;
  newState: QuestState;
  event: QuestTransition | null;
  blockedReason?: string;
}

// === 保留 QuestGuardContext 供 completionDetector 引用 ===

export interface QuestGuardContext {
  /** 当前游戏时间（hourIndex = day*24+hour） */
  gameHourIndex: number;
  /** 玩家当前位置 */
  playerLocation: string | null;
  /** 在场 NPC ID 列表 */
  presentNpcIds: string[];
  /** 玩家行囊物品 ID 列表 */
  inventoryItemIds: string[];
  /** 已解锁的世界标记 */
  unlockedFlags: string[];
  /** 玩家原石余额 */
  originium: number;
  /** 已完成的任务 ID 列表 */
  completedTaskIds: string[];
  /** 图鉴中已发现的 NPC */
  codexNpcIds: string[];
}
