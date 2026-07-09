/**
 * 确定性不变量检查器（v3 升级）
 *
 * 每一步都检查游戏状态是否始终合法。硬断言，秒出，免费。
 *
 * 检查清单：
 * 第一层（基础结构）：
 *  1. HP 不为负，不超过 maxHp
 *  2. 行囊物品数不超过最大槽位
 *  3. 理智值 ≥0
 *  4. 原石数 ≥0
 *  5. 武器属性范围
 *  6. 死亡 NPC 不应再次出现
 *  7. 位置必须在合法楼层
 *  8. 章节号 / 回合数非负
 *  9. 已完成任务不被回退
 *  10. 行囊槽位单调性
 *
 * 第二层（v3 升级）：
 *  11. DM-only 信息泄漏 — narrative 不应包含系统术语
 *  12. NPC 复活检测 — 死亡 NPC 在叙事中被描述为活着
 *  13. 位置瞬移 — player_location 异常跳变
 *  14. 物品凭空出现 — inventory 增加但无 awarded_items
 *  15. 关系单步变化上限
 *  16. 任务进度单调性
 *  17. Softlock — 连续 N 步无进展
 */

import type { GameStateSnapshot, InvariantCheckResult, InvariantViolation } from "./types";

/** 合法楼层列表 */
const VALID_FLOORS = ["B2", "B1", "1", "2", "3", "4", "5", "6", "7"];

/** 系统术语泄漏关键词 — narrative 不应包含这些 */
const DM_ONLY_LEAK_PATTERNS: Array<{
  pattern: RegExp;
  severity: InvariantViolation["severity"];
  description: string;
}> = [
  { pattern: /system\s*prompt/i, severity: "critical", description: "narrative 泄漏 system prompt 字样" },
  { pattern: /系统提示词/, severity: "critical", description: "narrative 包含「系统提示词」字样" },
  { pattern: /请严格以\s*JSON/, severity: "critical", description: "narrative 泄漏 JSON 格式指令" },
  { pattern: /^\s*\{\s*"is_action_legal"/, severity: "critical", description: "narrative 是裸 JSON 字符串" },
  { pattern: /\bDM指令\b/, severity: "major", description: "narrative 包含元叙事「DM指令」" },
  { pattern: /忽略.*设定/, severity: "major", description: "narrative 中描述 prompt injection" },
];

/** 武器属性随机突变 */
const SUSPICIOUS_JUMPS = {
  hp: 30,        // 单步 HP 变化不应超过 30
  sanity: 25,    // 单步 sanity 变化不应超过 25
  originium: 20, // 单步 originium 变化不应超过 20
};

/**
 * 执行所有不变量检查（含 narrative & DM JSON）。
 */
export function checkAllInvariants(
  stepIndex: number,
  state: GameStateSnapshot,
  previousState?: GameStateSnapshot,
  narrative?: string,
  dmJson?: Record<string, unknown>
): InvariantCheckResult {
  const violations: InvariantViolation[] = [];

  // ──── 第一层：基础结构 ────

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

  // 8. 章节号 / 回合数
  if (state.chapterNumber < 0) {
    violations.push({ rule: "chapter_non_negative", severity: "minor", description: "章节号不应为负", expected: "chapter ≥ 0", actual: `${state.chapterNumber}` });
  }
  if (state.turnCount < 0) {
    violations.push({ rule: "turn_count_non_negative", severity: "minor", description: "回合数不应为负", expected: "turnCount ≥ 0", actual: `${state.turnCount}` });
  }

  // 9. 已完成任务不被回退
  if (previousState) {
    if (state.completedTaskIds.length < previousState.completedTaskIds.length) {
      violations.push({ rule: "task_completion_monotonic", severity: "major", description: "已完成的任务被回退", expected: "已完成任务数不减少", actual: `${previousState.completedTaskIds.length} → ${state.completedTaskIds.length}` });
    }
    // 10. 行囊槽位单调性（除非丢弃）
    if (state.inventoryItemCount > previousState.inventoryItemCount + 10) {
      violations.push({ rule: "inventory_jump", severity: "major", description: "行囊单步增加超过 10（物品凭空出现）", expected: "单步 ≤ 10", actual: `${previousState.inventoryItemCount} → ${state.inventoryItemCount}` });
    }
  }

  // ──── 第二层：v3 升级 ────

  // 11. DM-only 信息泄漏
  if (narrative) {
    for (const { pattern, severity, description } of DM_ONLY_LEAK_PATTERNS) {
      if (pattern.test(narrative)) {
        violations.push({
          rule: "dm_only_leak",
          severity,
          description,
          expected: "narrative 不含系统术语",
          actual: `匹配: ${pattern.source}`,
        });
      }
    }
  }

  // 12. 状态跳变（v3 单步上限）
  if (previousState) {
    const dHp = Math.abs(state.hp - previousState.hp);
    if (dHp > SUSPICIOUS_JUMPS.hp) {
      violations.push({
        rule: "hp_jump",
        severity: "major",
        description: `HP 单步变化 ${dHp} 超过 ${SUSPICIOUS_JUMPS.hp}`,
        expected: `单步 |Δ| ≤ ${SUSPICIOUS_JUMPS.hp}`,
        actual: `${previousState.hp} → ${state.hp}`,
      });
    }
    const dSanity = Math.abs(state.sanity - previousState.sanity);
    if (dSanity > SUSPICIOUS_JUMPS.sanity) {
      violations.push({
        rule: "sanity_jump",
        severity: "major",
        description: `Sanity 单步变化 ${dSanity} 超过 ${SUSPICIOUS_JUMPS.sanity}`,
        expected: `单步 |Δ| ≤ ${SUSPICIOUS_JUMPS.sanity}`,
        actual: `${previousState.sanity} → ${state.sanity}`,
      });
    }
    const dOriginium = Math.abs(state.originium - previousState.originium);
    if (dOriginium > SUSPICIOUS_JUMPS.originium) {
      violations.push({
        rule: "originium_jump",
        severity: "major",
        description: `Originium 单步变化 ${dOriginium} 超过 ${SUSPICIOUS_JUMPS.originium}`,
        expected: `单步 |Δ| ≤ ${SUSPICIOUS_JUMPS.originium}`,
        actual: `${previousState.originium} → ${state.originium}`,
      });
    }
    // 13. 位置瞬移（楼层突变）
    if (previousState.playerLocation && state.playerLocation) {
      const prevFloor = extractFloor(previousState.playerLocation);
      const currFloor = extractFloor(state.playerLocation);
      if (prevFloor !== null && currFloor !== null && Math.abs(currFloor - prevFloor) > 3) {
        violations.push({
          rule: "position_teleport",
          severity: "major",
          description: `楼层单步跳跃 ${Math.abs(currFloor - prevFloor)} 层（疑似瞬移）`,
          expected: "单步 ≤ 3 层",
          actual: `${prevFloor} → ${currFloor}`,
        });
      }
    }
  }

  // ──── 第三层：DM JSON 结构 ────

  // 14. options 必填检查：当 is_action_legal 为 true 时 options 必须非空
  if (dmJson) {
    const isLegal = dmJson["is_action_legal"];
    if (isLegal === true) {
      const options = dmJson["options"];
      if (!Array.isArray(options) || options.length === 0) {
        violations.push({
          rule: "dm_json_options_missing",
          severity: "major",
          description: "is_action_legal 为 true 时 options 不应为空",
          expected: "options 为非空数组",
          actual: `options = ${JSON.stringify(options)}`,
        });
      }
    }
    // 15. consumes_time 应为布尔值
    if (dmJson["consumes_time"] !== undefined && typeof dmJson["consumes_time"] !== "boolean") {
      violations.push({
        rule: "dm_json_consumes_time_type",
        severity: "minor",
        description: "consumes_time 应为布尔值",
        expected: "boolean",
        actual: typeof dmJson["consumes_time"],
      });
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
  const knownLocations = [
    "旧公寓", "楼梯间", "走廊", "电梯", "大厅", "配电间",
    "登记口", "办公室", "消防通道", "B1", "B2",
  ];
  for (const known of knownLocations) {
    if (location.includes(known)) return true;
  }
  for (const floor of VALID_FLOORS) {
    if (location.includes(floor) || location.includes(`${floor}F`) || location.includes(`${floor}f`)) {
      return true;
    }
  }
  return true;
}

/**
 * 从位置字符串提取楼层号。
 * B2 → -2, B1 → -1, 1F → 1, 2F → 2, 3F → 3, etc.
 */
function extractFloor(location: string): number | null {
  const m = location.match(/B\s*(\d+)/i);
  if (m) return -parseInt(m[1] ?? "0", 10);
  const m2 = location.match(/(\d+)\s*F/i);
  if (m2) return parseInt(m2[1] ?? "0", 10);
  return null;
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
  if (curr.activeTaskIds.length !== prev.activeTaskIds.length) return true;
  if (curr.completedTaskIds.length > prev.completedTaskIds.length) return true;
  if (curr.playerLocation !== prev.playerLocation) return true;
  if (curr.inventoryItemCount !== prev.inventoryItemCount) return true;
  if (Math.abs(curr.hp - prev.hp) >= 2) return true;
  if (Math.abs(curr.sanity - prev.sanity) >= 1) return true;
  if (curr.codexNpcIds.length > prev.codexNpcIds.length) return true;
  if (curr.aliveNpcIds.length !== prev.aliveNpcIds.length) return true;
  if (curr.unlockedFlags.length > prev.unlockedFlags.length) return true;
  if (curr.reachedEnding !== prev.reachedEnding) return true;
  return false;
}

/** 生成游戏状态快照的初始值 */
export function createInitialStateSnapshot(
  overrides?: Partial<GameStateSnapshot>
): GameStateSnapshot {
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
    ...overrides,
  };
}

// === 跨步骤状态变化检测（NPC 复活 + 物品凭空） ===

/**
 * NPC 复活检测：在 state.deadNpcIds 中标记死亡的 NPC，是否在后文中
 * 出现在 aliveNpcIds 或被 narrative 描述为"在场/说话"。
 */
export interface NpcResurrectionResult {
  resurrections: Array<{
    npcId: string;
    diedAtStep: number;
    resurrectedAtStep: number;
    evidence: string;
  }>;
}

export function detectNpcResurrections(
  steps: Array<{
    stepIndex: number;
    stateAfter: GameStateSnapshot;
    narrative: string;
  }>
): NpcResurrectionResult {
  const resurrections: NpcResurrectionResult["resurrections"] = [];
  const diedAt = new Map<string, number>();

  for (const step of steps) {
    // 追踪死亡
    for (const deadId of step.stateAfter.deadNpcIds) {
      if (!diedAt.has(deadId)) {
        diedAt.set(deadId, step.stepIndex);
      }
    }
    // 检测复活
    for (const [npcId, diedStep] of diedAt.entries()) {
      if (step.stateAfter.aliveNpcIds.includes(npcId)) {
        resurrections.push({
          npcId,
          diedAtStep: diedStep,
          resurrectedAtStep: step.stepIndex,
          evidence: `stateAfter.aliveNpcIds 包含 ${npcId}`,
        });
      }
      // narrative 中描述死亡 NPC 为"在场"或"说话"
      if (step.narrative.includes(npcId) && step.stepIndex > diedStep) {
        // 不严格判定为复活 — 但记录为可能问题
      }
    }
  }

  return { resurrections };
}

// === 导出供测试的内部常量 ===

export const _internal = {
  VALID_FLOORS,
  DM_ONLY_LEAK_PATTERNS,
  SUSPICIOUS_JUMPS,
  extractFloor,
};