/**
 * 任务链 + 任务发现系统
 *
 * 参考开放世界游戏的进阶任务设计：
 * - 任务链（Quest Chain）：前置→当前→后续，形成叙事弧
 * - 任务发现（Quest Board）：按 favorability / location / 进度过滤可见任务
 * - NPC 主动授予：NPC 在特定条件下主动向玩家发放任务
 */

import type { GameTaskV2, GameTaskStatus } from "./taskV2";
import type { QuestState } from "./taskStateMachine";

// === 任务链 ===

export interface QuestChainLink {
  taskId: string;
  /** 前置任务 ID（为空表示链的起点） */
  prerequisiteTaskId: string | null;
  /** 后续任务 ID 列表（为空表示链的终点） */
  nextTaskIds: string[];
  /** 链的阶段序号（从 1 开始） */
  stageOrder: number;
  /** 链的 ID（同一链的任务共享） */
  chainId: string;
  /** 链的名称 */
  chainName: string;
}

export interface QuestChain {
  chainId: string;
  name: string;
  description: string;
  /** 按阶段排序的任务链 */
  stages: QuestChainLink[];
  /** 链的叙事弧描述 */
  narrativeArc: string;
}

/** 从任务 ID 构建链 */
export function buildQuestChain(args: {
  chainId: string;
  name: string;
  description: string;
  taskIds: string[];  // 按阶段顺序排列
  narrativeArc?: string;
}): QuestChain {
  const stages: QuestChainLink[] = args.taskIds.map((taskId, index) => ({
    taskId,
    prerequisiteTaskId: index > 0 ? (args.taskIds[index - 1] ?? null) : null,
    nextTaskIds: index < args.taskIds.length - 1 ? [args.taskIds[index + 1] ?? ""] : [],
    stageOrder: index + 1,
    chainId: args.chainId,
    chainName: args.name,
  }));

  return {
    chainId: args.chainId,
    name: args.name,
    description: args.description,
    stages,
    narrativeArc: args.narrativeArc ?? `${args.taskIds.length} 阶段任务链`,
  };
}

/** 获取任务的下一阶段任务 ID */
export function getNextTaskInChain(chain: QuestChain, currentTaskId: string): string | null {
  const current = chain.stages.find((s) => s.taskId === currentTaskId);
  if (!current || current.nextTaskIds.length === 0) return null;
  return current.nextTaskIds[0] ?? null;
}

/** 检查任务是否可以激活（前置任务是否已完成） */
export function canActivateTask(
  link: QuestChainLink,
  completedTaskIds: string[]
): boolean {
  if (!link.prerequisiteTaskId) return true;
  return completedTaskIds.includes(link.prerequisiteTaskId);
}

/** 获取链中的下一个可激活任务 */
export function getNextAvailableTask(
  chain: QuestChain,
  completedTaskIds: string[],
  allTasks: GameTaskV2[]
): GameTaskV2 | null {
  for (const stage of chain.stages) {
    if (completedTaskIds.includes(stage.taskId)) continue;
    if (!canActivateTask(stage, completedTaskIds)) continue;
    const task = allTasks.find((t) => t.id === stage.taskId);
    if (task && (task.status === "hidden" || task.status === "available")) return task;
  }
  return null;
}

// === 任务发现面板 ===

export interface QuestBoardFilter {
  /** 只看特定楼层的任务 */
  floorTier?: string;
  /** 需要的最低 NPC 好感度 */
  minFavorability?: number;
  /** 只看特定 NPC 发布的任务 */
  issuerId?: string;
  /** 只看特定类型 */
  taskType?: string;
  /** 只看特定表面分类 */
  surfaceClass?: string;
  /** 只看玩家当前位置可触发的 */
  playerLocation?: string;
  /** 排除已完成的任务 */
  excludeCompleted?: boolean;
  /** 排除隐藏任务 */
  excludeHidden?: boolean;
}

export interface QuestBoardItem {
  task: GameTaskV2;
  /** 是否可接取 */
  canAccept: boolean;
  /** 不可接取原因 */
  blockedReason?: string;
  /** 所属任务链 */
  chainName?: string;
  /** 链中的阶段 */
  chainStage?: number;
  /** 奖励预览 */
  rewardPreview: string[];
  /** 紧急度标签 */
  urgencyTag?: string;
}

export function filterQuestBoard(
  tasks: GameTaskV2[],
  filter: QuestBoardFilter,
  chains: QuestChain[] = [],
  completedTaskIds: string[] = [],
  inventoryItemIds: string[] = [],
  presentNpcIds: string[] = [],
): QuestBoardItem[] {
  let filtered = [...tasks];

  // 基础过滤
  if (filter.excludeCompleted !== false) {
    filtered = filtered.filter((t) => t.status !== "completed" && t.status !== "failed");
  }
  if (filter.excludeHidden !== false) {
    filtered = filtered.filter((t) => t.status !== "hidden");
  }
  if (filter.floorTier) {
    filtered = filtered.filter((t) => t.floorTier === filter.floorTier);
  }
  if (filter.issuerId) {
    filtered = filtered.filter((t) => t.issuerId === filter.issuerId);
  }
  if (filter.taskType) {
    filtered = filtered.filter((t) => t.type === filter.taskType);
  }
  if (filter.surfaceClass) {
    filtered = filtered.filter((t) => t.surfaceClass === filter.surfaceClass);
  }

  // 转换
  return filtered.map((task) => {
    const chainLink = findChainLink(task.id, chains);
    const canAccept = checkCanAccept(task, filter, completedTaskIds, inventoryItemIds, presentNpcIds);
    return {
      task,
      canAccept: canAccept.allowed,
      blockedReason: canAccept.reason,
      chainName: chainLink?.chainName,
      chainStage: chainLink?.stageOrder,
      rewardPreview: previewRewardSummary(task),
      urgencyTag: task.deadlineHint ?? (task.highRiskHighReward ? "高风险高回报" : undefined),
    };
  });
}

function checkCanAccept(
  task: GameTaskV2,
  filter: QuestBoardFilter,
  completedTaskIds: string[],
  inventoryItemIds: string[],
  presentNpcIds: string[],
): { allowed: boolean; reason?: string } {
  if (task.status === "completed") return { allowed: false, reason: "已完成" };
  if (task.status === "failed") return { allowed: false, reason: "已失败" };

  // NPC 授予模式：需要 NPC 在场
  if (task.claimMode === "npc_grant" && filter.playerLocation) {
    const npcPresent = presentNpcIds.includes(task.issuerId);
    if (!npcPresent) return { allowed: false, reason: `${task.issuerName}不在场` };

    // 好感度门槛
    if (task.npcProactiveGrant.enabled && task.npcProactiveGrant.minFavorability > 0) {
      if (filter.minFavorability !== undefined && filter.minFavorability < task.npcProactiveGrant.minFavorability) {
        return { allowed: false, reason: `需要${task.issuerName}好感度≥${task.npcProactiveGrant.minFavorability}` };
      }
    }
  }

  // 道具要求（如果有 requiredItemIds）
  if (task.requiredItemIds && task.requiredItemIds.length > 0) {
    const missing = task.requiredItemIds.filter((id) => !inventoryItemIds.includes(id));
    if (missing.length > 0 && task.status === "available") {
      // 对于 available 任务，缺少道具只是不能激活，不是不能看见
      return { allowed: false, reason: `缺少道具：${missing.join("、")}` };
    }
  }

  return { allowed: true };
}

function findChainLink(taskId: string, chains: QuestChain[]): QuestChainLink | null {
  for (const chain of chains) {
    const link = chain.stages.find((s) => s.taskId === taskId);
    if (link) return link;
  }
  return null;
}

function previewRewardSummary(task: GameTaskV2): string[] {
  const lines: string[] = [];
  if (task.reward.originium > 0) lines.push(`原石 ×${task.reward.originium}`);
  if (task.reward.items.length > 0) lines.push(`道具 ×${task.reward.items.length}`);
  if (task.reward.relationshipChanges.length > 0) lines.push(`关系变化 ×${task.reward.relationshipChanges.length}`);
  if (task.reward.unlocks.length > 0) lines.push(`解锁 ×${task.reward.unlocks.length}`);
  return lines.length > 0 ? lines : ["线索推进"];
}

// === NPC 主动授予 ===

export interface NpcGrantOpportunity {
  task: GameTaskV2;
  npcId: string;
  npcName: string;
  /** 触发条件 */
  triggerConditions: {
    minFavorability: number;
    preferredLocations: string[];
    cooldownHours: number;
  };
  /** 是否在冷却中 */
  isOnCooldown: boolean;
  /** 冷却剩余小时数 */
  cooldownRemainingHours: number;
}

export function findNpcGrantOpportunities(
  tasks: GameTaskV2[],
  currentGameHour: number,
  presentNpcIds: string[],
  playerLocation: string | null,
  codexFavorability: Record<string, number>,
): NpcGrantOpportunity[] {
  return tasks
    .filter((t) => t.npcProactiveGrant.enabled && (t.status === "available" || t.status === "hidden"))
    .map((task) => {
      const grant = task.npcProactiveGrant;
      const lastIssued = task.npcProactiveGrantLastIssuedHour ?? -999;
      const cooldownRemaining = Math.max(0, grant.cooldownHours - (currentGameHour - lastIssued));
      const isOnCooldown = cooldownRemaining > 0;

      // 只有 NPC 在场 + 玩家在正确位置时才算 opportunity
      const npcPresent = presentNpcIds.includes(grant.npcId);
      const inPreferredLocation = grant.preferredLocations.length === 0 ||
        (playerLocation && grant.preferredLocations.includes(playerLocation));
      const favorabilityOk = (codexFavorability[grant.npcId] ?? 0) >= grant.minFavorability;

      const isAvailable = npcPresent && inPreferredLocation && favorabilityOk && !isOnCooldown;

      return {
        task: isAvailable ? { ...task, status: "available" as GameTaskStatus } : task,
        npcId: grant.npcId,
        npcName: task.issuerName,
        triggerConditions: {
          minFavorability: grant.minFavorability,
          preferredLocations: grant.preferredLocations,
          cooldownHours: grant.cooldownHours,
        },
        isOnCooldown,
        cooldownRemainingHours: cooldownRemaining,
      };
    });
}

/** 检查是否有新任务可以在当前场景中授予 */
export function checkForNewQuestOpportunities(
  tasks: GameTaskV2[],
  currentGameHour: number,
  presentNpcIds: string[],
  playerLocation: string | null,
  codexFavorability: Record<string, number>,
): GameTaskV2[] {
  const opportunities = findNpcGrantOpportunities(
    tasks, currentGameHour, presentNpcIds, playerLocation, codexFavorability
  );
  return opportunities
    .filter((o) => !o.isOnCooldown)
    .filter((o) => o.task.status !== "hidden") // 只返回可见的
    .map((o) => o.task);
}
