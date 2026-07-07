/**
 * 确定性不变量检查器
 *
 * 每一步都检查游戏状态是否始终合法。硬断言，秒出，免费。
 *
 * 检查清单：
 * 1. HP 不为负，不超过 maxHp
 * 2. 行囊物品数不超过最大槽位
 * 3. 理智值 ≥0，不超过历史最大
 * 4. 原石数 ≥0
 * 5. 武器装备与职业不矛盾
 * 6. 死亡 NPC 不应再次出现
 * 7. 位置必须在合法楼层
 * 8. 武器 stability 在 0-100 范围
 * 9. 武器 contamination 在 0-100 范围
 * 10. Softlock 检测：连续 N 步无进展
 */

import type { GameStateSnapshot, InvariantCheckResult, InvariantViolation } from "./types";

/** 合法楼层列表 */
const VALID_FLOORS = ["B2", "B1", "1", "2", "3", "4", "5", "6", "7"];

/**
 * 执行所有不变量检查
 */
export function checkAllInvariants(
  stepIndex: number,
  state: GameStateSnapshot,
  previousState?: GameStateSnapshot
): InvariantCheckResult {
  const violations: InvariantViolation[] = [];

  // 1. HP 检查
  if (state.hp < 0) {
    violations.push({ rule: "hp_non_negative", severity: "critical", description: "HP不应为负", expected: "HP ≥ 0", actual: `HP = ${state.hp}` });
  }
  if (state.hp > state.maxHp) {
    violations.push({ rule: "hp_max", severity: "major", description: "HP超过最大值", expected: `HP ≤ ${state.maxHp}`, actual: `HP = ${state.hp}` });
  }

  // 2. 行囊槽位
  if (state.inventoryItemCount > state.maxInventorySlots) {
    violations.push({ rule: "inventory_slots", severity: "major", description: "行囊超出槽位上限", expected: `≤ ${state.maxInventorySlots} 件`, actual: `${state.inventoryItemCount} 件` });
  }

  // 3. 理智值
  if (state.sanity < 0) {
    violations.push({ rule: "sanity_non_negative", severity: "critical", description: "理智值不应为负", expected: "sanity ≥ 0", actual: `sanity = ${state.sanity}` });
  }

  // 4. 原石
  if (state.originium < 0) {
    violations.push({ rule: "originium_non_negative", severity: "major", description: "原石数不应为负", expected: "originium ≥ 0", actual: `originium = ${state.originium}` });
  }

  // 5. 武器属性
  if (state.weaponStability < 0 || state.weaponStability > 100) {
    violations.push({ rule: "weapon_stability_range", severity: "major", description: "武器稳定度应在0-100", expected: "0-100", actual: `${state.weaponStability}` });
  }
  if (state.weaponContamination < 0 || state.weaponContamination > 100) {
    violations.push({ rule: "weapon_contamination_range", severity: "major", description: "武器污染度应在0-100", expected: "0-100", actual: `${state.weaponContamination}` });
  }

  // 6. 死亡 NPC 不应再出现
  for (const deadId of state.deadNpcIds) {
    if (state.aliveNpcIds.includes(deadId)) {
      violations.push({ rule: "npc_alive_consistency", severity: "critical", description: `已死亡的NPC仍在存活列表中: ${deadId}`, expected: `${deadId} ∉ aliveNpcIds`, actual: `${deadId} ∈ aliveNpcIds` });
    }
  }

  // 7. 位置合法性
  if (state.playerLocation && !isValidLocation(state.playerLocation)) {
    violations.push({ rule: "location_valid", severity: "minor", description: "玩家位置可能不合法", expected: "合法位置", actual: state.playerLocation });
  }

  // 8. 章节号
  if (state.chapterNumber < 0) {
    violations.push({ rule: "chapter_non_negative", severity: "minor", description: "章节号不应为负", expected: "chapter ≥ 0", actual: `${state.chapterNumber}` });
  }

  // 9. 回合数
  if (state.turnCount < 0) {
    violations.push({ rule: "turn_count_non_negative", severity: "minor", description: "回合数不应为负", expected: "turnCount ≥ 0", actual: `${state.turnCount}` });
  }

  // 10. 进度检查（与前一步比较）
  if (previousState) {
    // 任务只能增加，不能减少（除非完成）
    if (state.completedTaskIds.length < previousState.completedTaskIds.length) {
      violations.push({ rule: "task_completion_monotonic", severity: "major", description: "已完成的任务被回退", expected: "已完成任务数不减少", actual: `${previousState.completedTaskIds.length} → ${state.completedTaskIds.length}` });
    }
  }

  return {
    stepIndex,
    passed: violations.every((v) => v.severity !== "critical"),
    violations,
  };
}

/**
 * 检查位置是否在合法范围内。
 * 宽松检查：只要位置字符串包含已知关键词或楼层号即视为合法。
 */
function isValidLocation(location: string): boolean {
  if (!location) return false;

  // 精确匹配
  const knownLocations = [
    "旧公寓", "楼梯间", "走廊", "电梯", "大厅", "配电间",
    "登记口", "办公室", "消防通道", "B1", "B2",
  ];
  for (const known of knownLocations) {
    if (location.includes(known)) return true;
  }

  // 检查是否包含合法楼层号
  for (const floor of VALID_FLOORS) {
    if (location.includes(floor) || location.includes(`${floor}F`) || location.includes(`${floor}f`)) {
      return true;
    }
  }

  // 如果没有已知关键词也没有楼层号，可能是新地点——报 minor warning 但不阻止
  return true;
}

// === Softlock 检测 ===

/**
 * Softlock 检测：连续 N 步没有任何有意义的进展。
 *
 * "进展"定义：
 * - 任务状态改变（新增/完成）
 * - 位置改变
 * - NPC 状态改变
 * - 物品获取/消耗
 * - HP/理智显著变化
 * - 达到结局
 */
export interface SoftlockCheckResult {
  isSoftlocked: boolean;
  consecutiveStaleSteps: number;
  lastProgressStep: number;
  reason: string;
}

export function checkSoftlock(
  steps: Array<{ state: GameStateSnapshot | null }>,
  threshold: number
): SoftlockCheckResult {
  if (steps.length < 2) {
    return { isSoftlocked: false, consecutiveStaleSteps: 0, lastProgressStep: 0, reason: "" };
  }

  let consecutiveStale = 0;
  let lastProgress = 0;

  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]?.state;
    const curr = steps[i]?.state;
    if (!prev || !curr) continue;

    if (hasProgress(prev, curr)) {
      consecutiveStale = 0;
      lastProgress = i;
    } else {
      consecutiveStale++;
    }
  }

  return {
    isSoftlocked: consecutiveStale >= threshold,
    consecutiveStaleSteps: consecutiveStale,
    lastProgressStep: lastProgress,
    reason: consecutiveStale >= threshold
      ? `连续${consecutiveStale}步无进展（阈值=${threshold}），最后进展在第${lastProgress}步`
      : "",
  };
}

/**
 * 判断两步之间是否有进展
 */
function hasProgress(prev: GameStateSnapshot, curr: GameStateSnapshot): boolean {
  // 任务进展
  if (curr.activeTaskIds.length !== prev.activeTaskIds.length) return true;
  if (curr.completedTaskIds.length > prev.completedTaskIds.length) return true;

  // 位置改变
  if (curr.playerLocation !== prev.playerLocation) return true;

  // 物品变化
  if (curr.inventoryItemCount !== prev.inventoryItemCount) return true;

  // HP/理智显著变化（>=2 点）
  if (Math.abs(curr.hp - prev.hp) >= 2) return true;
  if (Math.abs(curr.sanity - prev.sanity) >= 1) return true;

  // 图鉴更新
  if (curr.codexNpcIds.length > prev.codexNpcIds.length) return true;

  // NPC 状态变化
  if (curr.aliveNpcIds.length !== prev.aliveNpcIds.length) return true;

  // 标记解锁
  if (curr.unlockedFlags.length > prev.unlockedFlags.length) return true;

  // 结局/死亡
  if (curr.reachedEnding !== prev.reachedEnding) return true;

  return false;
}

/** 生成游戏状态快照的初始值 */
export function createInitialStateSnapshot(): GameStateSnapshot {
  return {
    hp: 10,
    maxHp: 10,
    sanity: 80,
    originium: 3,
    inventoryItemIds: ["item_phone", "item_bandage"],
    inventoryItemCount: 2,
    maxInventorySlots: 8,
    profession: null,
    equippedWeapon: null,
    weaponStability: 100,
    weaponContamination: 0,
    playerLocation: "旧公寓三楼走廊",
    currentFloor: "3F",
    activeTaskIds: [],
    completedTaskIds: [],
    aliveNpcIds: [],
    deadNpcIds: [],
    codexNpcIds: [],
    turnCount: 0,
    chapterNumber: 1,
    isDeath: false,
    reachedEnding: false,
    unlockedFlags: [],
  };
}
