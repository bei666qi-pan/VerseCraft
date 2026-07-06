/**
 * 任务状态机 — 明确的任务生命周期与转换守卫
 *
 * 参考开放世界游戏任务设计（《原神》《巫师3》等）的核心模式：
 * - 任务有明确的阶段（锁定→可接取→进行中→可交付→已完成/已失败）
 * - 状态转换有守卫条件，防止非法跳转
 * - 每个转换产生可观测事件（用于遥测和 UI）
 *
 * 状态流：
 *   locked → available → active → deliverable → completed
 *                    ↘ active → failed
 *                    ↘ expired
 */

import type { GameTaskV2, GameTaskStatus, GameTaskRewardV2 } from "./taskV2";

// === 扩展状态 ===

/** 扩展的任务状态（比 GameTaskStatus 更细粒度） */
export type QuestState =
  | "locked"        // 未满足前置条件，不可见
  | "available"     // 可接取（NPC 已告知或任务板可见）
  | "active"        // 进行中
  | "deliverable"   // 目标已完成，等待交付/领取奖励
  | "completed"     // 已完成（奖励已领取）
  | "failed"        // 已失败
  | "expired";      // 已过期

/** 状态转换事件 */
export interface QuestTransition {
  from: QuestState;
  to: QuestState;
  taskId: string;
  taskTitle: string;
  reason: string;
  timestamp: number;
}

/** 状态转换守卫条件 */
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

/** 状态转换结果 */
export interface QuestTransitionResult {
  allowed: boolean;
  newState: QuestState;
  event: QuestTransition | null;
  blockedReason?: string;
}

// === 状态机核心 ===

/** 合法的状态转换映射 */
const VALID_TRANSITIONS: Record<QuestState, QuestState[]> = {
  locked: ["available"],
  available: ["active", "expired"],
  active: ["deliverable", "failed", "expired"],
  deliverable: ["completed", "expired"],
  completed: [],   // 终态
  failed: [],      // 终态
  expired: [],     // 终态
};

/** 将 GameTaskStatus 映射到 QuestState */
export function taskStatusToQuestState(status: GameTaskStatus, isDeliverable?: boolean): QuestState {
  if (status === "hidden") return "locked";
  if (status === "available") return "available";
  if (status === "active" && isDeliverable) return "deliverable";
  if (status === "active") return "active";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "available";
}

/** 将 QuestState 映射回 GameTaskStatus */
export function questStateToTaskStatus(state: QuestState): GameTaskStatus {
  switch (state) {
    case "locked": return "hidden";
    case "available": return "available";
    case "active":
    case "deliverable": return "active";
    case "completed": return "completed";
    case "failed": return "failed";
    case "expired": return "failed";
  }
}

/** 检查状态转换是否合法 */
export function canTransition(from: QuestState, to: QuestState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// === 转换守卫 ===

/**
 * 激活任务：available → active
 * 条件：玩家接受任务（叙事确认或 UI 操作）
 */
export function guardActivate(task: GameTaskV2, ctx: QuestGuardContext): QuestTransitionResult {
  const from: QuestState = "available";
  const to: QuestState = "active";

  if (!canTransition(from, to)) {
    return { allowed: false, newState: from, event: null, blockedReason: "invalid_transition" };
  }

  // 守卫 1：任务不能已过期
  if (task.expiresAt) {
    const expiryHour = parseExpiryHour(task.expiresAt);
    if (expiryHour !== null && ctx.gameHourIndex > expiryHour) {
      return {
        allowed: false, newState: "expired",
        event: createTransition(from, "expired", task, "deadline_passed"),
        blockedReason: "task_expired",
      };
    }
  }

  return {
    allowed: true,
    newState: to,
    event: createTransition(from, to, task, "player_accepted"),
  };
}

/**
 * 标记为可交付：active → deliverable
 * 条件：任务目标已达成（物品收集、位置到达、NPC 交互等）
 */
export function guardMarkDeliverable(task: GameTaskV2, ctx: QuestGuardContext): QuestTransitionResult {
  const from: QuestState = "active";
  const to: QuestState = "deliverable";

  if (!canTransition(from, to)) {
    return { allowed: false, newState: from, event: null, blockedReason: "invalid_transition" };
  }

  // 守卫 1：如果任务有 requiredItemIds，检查是否全部持有
  if (task.requiredItemIds && task.requiredItemIds.length > 0) {
    const hasAllItems = task.requiredItemIds.every((id) => ctx.inventoryItemIds.includes(id));
    if (!hasAllItems) {
      return {
        allowed: false, newState: from, event: null,
        blockedReason: `missing_items:${task.requiredItemIds.filter((id) => !ctx.inventoryItemIds.includes(id)).join(",")}`,
      };
    }
  }

  return {
    allowed: true,
    newState: to,
    event: createTransition(from, to, task, "objectives_met"),
  };
}

/**
 * 完成任务（领取奖励）：deliverable → completed
 * 条件：NPC 授予模式需要发布者在场；auto 模式直接完成
 */
export function guardComplete(task: GameTaskV2, ctx: QuestGuardContext): QuestTransitionResult {
  const from: QuestState = "deliverable";
  const to: QuestState = "completed";

  if (!canTransition(from, to)) {
    return { allowed: false, newState: from, event: null, blockedReason: "invalid_transition" };
  }

  // 守卫 1：npc_grant 模式需要 NPC 在场
  if (task.claimMode === "npc_grant") {
    const issuerPresent = ctx.presentNpcIds.includes(task.issuerId);
    if (!issuerPresent) {
      return {
        allowed: false, newState: from, event: null,
        blockedReason: `npc_not_present:${task.issuerId}`,
      };
    }
  }

  // 守卫 2：如果有前置任务链，检查前置是否完成
  // （由 questChain 系统处理，这里只做基本检查）

  return {
    allowed: true,
    newState: to,
    event: createTransition(from, to, task, `reward_claimed_via_${task.claimMode}`),
  };
}

/**
 * 任务失败：active → failed
 * 条件：超时、关键 NPC 死亡、玩家做出不可逆选择等
 */
export function guardFail(task: GameTaskV2, reason: string): QuestTransitionResult {
  const from: QuestState = "active";
  const to: QuestState = "failed";

  if (!canTransition(from, to)) {
    return { allowed: false, newState: from, event: null, blockedReason: "invalid_transition" };
  }

  return {
    allowed: true,
    newState: to,
    event: createTransition(from, to, task, reason),
  };
}

/**
 * 任务过期：任何非终态 → expired
 */
export function guardExpire(task: GameTaskV2, currentState: QuestState): QuestTransitionResult {
  if (!canTransition(currentState, "expired")) {
    return { allowed: false, newState: currentState, event: null, blockedReason: "cannot_expire_from_terminal" };
  }

  return {
    allowed: true,
    newState: "expired",
    event: createTransition(currentState, "expired", task, "deadline_passed"),
  };
}

// === 辅助函数 ===

function createTransition(from: QuestState, to: QuestState, task: GameTaskV2, reason: string): QuestTransition {
  return {
    from,
    to,
    taskId: task.id,
    taskTitle: task.title,
    reason,
    timestamp: Date.now(),
  };
}

function parseExpiryHour(expiresAt: string): number | null {
  // 支持格式："day:3,hour:18" 或直接数字
  const dayMatch = expiresAt.match(/day:(\d+)/);
  const hourMatch = expiresAt.match(/hour:(\d+)/);
  if (dayMatch && hourMatch) {
    return Number(dayMatch[1]) * 24 + Number(hourMatch[1]);
  }
  const num = Number(expiresAt);
  return Number.isFinite(num) ? num : null;
}

/** 获取任务的当前 QuestState */
export function getQuestState(task: GameTaskV2): QuestState {
  return taskStatusToQuestState(task.status, false);
}

/** 判断是否为终态 */
export function isTerminal(state: QuestState): boolean {
  return state === "completed" || state === "failed" || state === "expired";
}

/** 判断是否为活跃态（玩家可以与之交互） */
export function isInteractive(state: QuestState): boolean {
  return state === "available" || state === "active" || state === "deliverable";
}
