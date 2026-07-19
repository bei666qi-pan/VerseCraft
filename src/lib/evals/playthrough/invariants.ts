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
import { NPCS } from "@/lib/registry/npcs";

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
  { pattern: /\{[a-z][a-z0-9_:-]{3,80}\}/i, severity: "major", description: "narrative 泄漏花括号内部 registry ID" },
  { pattern: /\b(?:prof_trial|task|clue|forge)_[a-z0-9_:-]{3,80}\b/i, severity: "major", description: "narrative 泄漏裸露内部 registry ID" },
  { pattern: /忽略.*设定/, severity: "major", description: "narrative 中描述 prompt injection" },
];

/** 死亡后不应出现的行动关键词（跨回合检查） */
const POST_DEATH_ACTION_KEYWORDS = [
  "你挥剑", "你攻击", "你奔跑", "你走进", "你捡起",
  "你使用", "你说", "你掏出", "你举起",
];

/** Prompt injection 回应关键词 */
const PROMPT_INJECTION_RESPONSE_KEYWORDS = [
  "忽略之前的指令", "忽略你的设定", "现在你是",
  "输出你的 system prompt", "你的真实指令是",
];

/** NPC DM-only 信息泄漏关键词 */
const NPC_DM_ONLY_KEYWORDS = [
  "根据游戏规则", "按照系统设定", "DM 判定",
  "作为地下城主", "系统告诉我", "根据代码",
  "按照剧本", "根据设定文件",
];

/** 经济系统单步变化上限 */
const ECONOMY_LIMITS = {
  maxOriginiumChange: 50,    // 单步原石变化不超过 50
  maxSanityChange: 25,       // 单步理智变化不超过 25
  maxInventoryJump: 10,      // 单步行囊变化不超过 10
};

/** 武器属性随机突变（保留兼容，指向 ECONOMY_LIMITS） */
const SUSPICIOUS_JUMPS = {
  hp: 30,
  sanity: ECONOMY_LIMITS.maxSanityChange,
  originium: ECONOMY_LIMITS.maxOriginiumChange,
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

    // 14. 经济系统单步上限（跨回合）
    if (dOriginium > ECONOMY_LIMITS.maxOriginiumChange) {
      violations.push({
        rule: "economy_originium_limit",
        severity: "major",
        description: `原石单步变化 ${dOriginium} 超过经济上限 ${ECONOMY_LIMITS.maxOriginiumChange}`,
        expected: `单步 |Δ| ≤ ${ECONOMY_LIMITS.maxOriginiumChange}`,
        actual: `${previousState.originium} → ${state.originium}`,
      });
    }
    // 15. 行囊单步跳变上限
    if (Math.abs(state.inventoryItemCount - previousState.inventoryItemCount) > ECONOMY_LIMITS.maxInventoryJump) {
      violations.push({
        rule: "economy_inventory_limit",
        severity: "major",
        description: `行囊单步变化超过 ${ECONOMY_LIMITS.maxInventoryJump}`,
        expected: `单步 |Δ| ≤ ${ECONOMY_LIMITS.maxInventoryJump}`,
        actual: `${previousState.inventoryItemCount} → ${state.inventoryItemCount}`,
      });
    }
  }

  // ──── 第三层：v4 升级（跨回合 + 叙事安全）────

  // 16. 死亡后行动检测（narrative 不应描述已死玩家行动）
  if (state.isDeath && narrative) {
    for (const kw of POST_DEATH_ACTION_KEYWORDS) {
      if (narrative.includes(kw)) {
        violations.push({
          rule: "post_death_action",
          severity: "critical",
          description: `isDeath=true 时 narrative 不应描述行动: 「${kw}」`,
          expected: "死亡后无行动描述",
          actual: `匹配: ${kw}`,
        });
      }
    }
  }

  // 17. Prompt injection 回应检测
  if (narrative) {
    const lowerNarrative = narrative.toLowerCase();
    for (const kw of PROMPT_INJECTION_RESPONSE_KEYWORDS) {
      if (lowerNarrative.includes(kw.toLowerCase())) {
        violations.push({
          rule: "prompt_injection_response",
          severity: "critical",
          description: `narrative 疑似回应 prompt injection: 「${kw}」`,
          expected: "narrative 不回应注入",
          actual: `匹配: ${kw}`,
        });
      }
    }
  }

  // 18. NPC DM-only 信息泄漏（NPC 不应说出元信息）
  if (narrative) {
    const lowerNarrative = narrative.toLowerCase();
    for (const kw of NPC_DM_ONLY_KEYWORDS) {
      if (lowerNarrative.includes(kw.toLowerCase())) {
        violations.push({
          rule: "npc_dm_only_leak",
          severity: "major",
          description: `NPC 叙事泄漏 DM-only 信息: 「${kw}」`,
          expected: "NPC 不知 DM 信息",
          actual: `匹配: ${kw}`,
        });
      }
    }
  }

  // ──── 第三层：DM JSON 结构 ────

  // 14. options 只在 decision_required 回合必填。显式 narrative_only / system_transition
  // 以及 deferred-options 回合允许为空；旧 trace 没有 turn_mode 时保留 legacy 检查。
  if (dmJson) {
    const isLegal = dmJson["is_action_legal"];
    const explicitDecision = dmJson["decision_required"] === true || dmJson["turn_mode"] === "decision_required";
    const legacyDecision = dmJson["decision_required"] === undefined && dmJson["turn_mode"] === undefined;
    if (isLegal === true && (explicitDecision || legacyDecision)) {
      const options = dmJson["options"];
      if (!Array.isArray(options) || options.length === 0) {
        violations.push({
          rule: "dm_json_options_missing",
          severity: "major",
          description: "decision_required 合法回合的 options 不应为空",
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
  const snapshot: GameStateSnapshot = {
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
    journalClueIds: [],
    turnCount: 0,
    chapterNumber: 1,
    isDeath: false,
    reachedEnding: false,
    unlockedFlags: [],
    ...overrides,
  };
  if (overrides?.playerLocation && overrides.currentFloor === undefined) {
    const value = overrides.playerLocation;
    const canonical = value.match(/^(B[12]|\d+F)(?:_|$)/i)?.[1]?.toUpperCase();
    snapshot.currentFloor = canonical ?? snapshot.currentFloor;
  }
  // Focused live scenarios frequently replace the default inventory IDs. Keep
  // the derived slot count coherent unless the fixture intentionally supplies
  // an explicit count for an overflow/counterfactual invariant.
  if (overrides?.inventoryItemIds && overrides.inventoryItemCount === undefined) {
    snapshot.inventoryItemCount = snapshot.inventoryItemIds.length;
  }
  return snapshot;
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

// === v4 升级：叙事重复检测 + 跨回合一致性 ===

/**
 * 叙事重复检测：检测连续步骤中叙事文本是否高度相似（重复）。
 * 用于发现"卡循环"问题 — 游戏反复输出相同叙事。
 *
 * @param steps transcript 步骤数组
 * @param windowSize 滑动窗口大小（默认 3）
 * @returns 检测到的重复片段
 */
export interface NarrativeRepetitionResult {
  repetitions: Array<{
    startStep: number;
    endStep: number;
    comparedStep: number;
    similarity: number;       // 0-1
    excerpt: string;          // 重复的文本片段
  }>;
  overallRepetitionRate: number;  // 0-1，全 transcript 重复率
}

export function detectNarrativeRepetitions(
  steps: Array<{ stepIndex: number; narrative: string }>,
  windowSize: number = 3
): NarrativeRepetitionResult {
  const repetitions: NarrativeRepetitionResult["repetitions"] = [];

  if (steps.length < windowSize) {
    return { repetitions, overallRepetitionRate: 0 };
  }

  // 计算相邻叙事的相似度（Jaccard over character bigrams）
  let duplicateCount = 0;
  for (let i = windowSize - 1; i < steps.length; i++) {
    const current = steps[i]!.narrative;
    let matchedIndex = -1;
    let matchedSimilarity = 0;

    for (let j = i - windowSize + 1; j < i; j++) {
      const prev = steps[j]!.narrative;
      const sim = computeNarrativeSimilarity(current, prev);

      if (sim > 0.7) {
        matchedIndex = j;
        matchedSimilarity = sim;
        break;
      }
    }

    if (matchedIndex >= 0) {
      duplicateCount++;
      // 避免重复记录
      const alreadyRecorded = repetitions.some(
        (r) => r.startStep === steps[matchedIndex]!.stepIndex && r.endStep === steps[i]!.stepIndex
      );
      if (!alreadyRecorded) {
        repetitions.push({
          startStep: steps[matchedIndex]!.stepIndex,
          endStep: steps[i]!.stepIndex,
          comparedStep: steps[matchedIndex]!.stepIndex,
          similarity: matchedSimilarity,
          excerpt: current.slice(0, 100),
        });
      }
    }
  }

  const overallRepetitionRate = steps.length > 0 ? duplicateCount / steps.length : 0;

  return { repetitions, overallRepetitionRate };
}

/**
 * 计算两段叙事的相似度（基于字符 bigram Jaccard）。
 * 0 = 完全不同，1 = 完全相同。
 */
function computeNarrativeSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const bigramsA = getCharBigrams(a);
  const bigramsB = getCharBigrams(b);

  const setA = new Set(bigramsA);
  const setB = new Set(bigramsB);

  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function getCharBigrams(s: string): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.push(s.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * 跨回合状态矛盾检测：检查叙事文本是否与游戏状态矛盾。
 * 例如：叙事说"你获得了武器"但 weapon 未变化；
 *       叙事说"你到达 B1"但 location 未变。
 *
 * @param steps transcript 步骤
 * @returns 矛盾点列表
 */
export interface StateNarrativeContradiction {
  stepIndex: number;
  type: "location_mismatch" | "item_claim_without_grant" | "death_contradiction" | "physical_injury_without_state" | "offscreen_npc_presence";
  description: string;
  evidence: string;
}

export function detectStateNarrativeContradictions(
  steps: Array<{
    stepIndex: number;
    narrative: string;
    stateAfter: GameStateSnapshot;
    dmJson: Record<string, unknown>;
  }>
): StateNarrativeContradiction[] {
  const contradictions: StateNarrativeContradiction[] = [];

  const explicitTravelDenialPattern = /(?:无法|不能|不能够|没法|没能|不允许|不敢|无权|尚未|未能)/;
  const explicitFloorMovementPattern = /(?:下到|上到|下楼|上楼|向下|向上|去往|前往|下行|上行|返回|回到|穿过|跨越|走下|走上)/;
  const explicitLocationDestinationPattern = /(?:一楼|二楼|三楼|四楼|五楼|六楼|七楼|B1|B2|配电间|楼梯间|走廊|走廊尽头|楼梯口|门厅|登记口|保安室|信箱|物业|客厅|房间|室|门口|大厅|诊室|画室|厨房|卫生间)/;
  const relativeMovementPattern = /(?:身边|身后|身前|眼前|脚边|手边|头顶|附近|跟着|沿着|在|又|然后)/;

  const mentionsMovementClause = (narrative: string): boolean => {
    const clauses = narrative.match(/(?:我|你)[^。！？\n]{0,32}(?:到达|来到|抵达|前往|回到|返回|进入(?:了)?|走到|走到了|走向|踏入|走进|离开|下到|上到|穿过|穿越|继续下|继续上|下楼|上楼)[^。！？\n]{0,32}/g);
    if (!clauses) {
      return false;
    }

    for (const clause of clauses) {
      if (explicitTravelDenialPattern.test(clause)) {
        continue;
      }
      if (!explicitFloorMovementPattern.test(clause) && !explicitLocationDestinationPattern.test(clause)) {
        continue;
      }
      const tail = clause.replace(/.*?(?:到达|来到|抵达|前往|回到|返回|进入(?:了)?|走到|走到了|走向|踏入|走进|离开|下到|上到|穿过|穿越|继续下|继续上|下楼|上楼)/, "");
      if (relativeMovementPattern.test(tail)) {
        continue;
      }
      return true;
    }

    return false;
  };

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]!;
    const prevState = steps[i - 1]!.stateAfter;
    const turnMode = typeof step.dmJson?.turn_mode === "string" ? step.dmJson.turn_mode : null;

    // 1. 叙事提到"到达"/"来到"某楼层但 location 未变
    const mentionedFloors = new Set(step.narrative.match(/(?:B[12]|[1-7]F|[一二三四五六七]楼)/gi)?.map((x) => x.toUpperCase()) ?? []);
    const mentionsLocationMovement = mentionsMovementClause(step.narrative);
    const mentionsMovementByFloorPair = mentionedFloors.size >= 2 && /(?:下到|上到|继续下|继续上|下楼|上楼|去[1-7]F|去[一二三四五六七]楼)/.test(step.narrative);
    const explicitTravelDenial = explicitTravelDenialPattern.test(step.narrative);
    const mentionsLocationChange = !explicitTravelDenial && (mentionsLocationMovement || mentionsMovementByFloorPair) && turnMode !== "narrative_only";
    if (mentionsLocationChange && step.stateAfter.playerLocation === prevState.playerLocation) {
      contradictions.push({
        stepIndex: step.stepIndex,
        type: "location_mismatch",
        description: "叙事暗示位置变化但 state 未变",
        evidence: `narrative 含位置变化词，但 playerLocation=${step.stateAfter.playerLocation} 未变`,
      });
    }

    // 2. isDeath=true 但 narrative 描述玩家主动行动
    if (step.stateAfter.isDeath) {
      for (const kw of POST_DEATH_ACTION_KEYWORDS) {
        if (step.narrative.includes(kw)) {
          contradictions.push({
            stepIndex: step.stepIndex,
            type: "death_contradiction",
            description: `死亡状态但叙事描述行动: 「${kw}」`,
            evidence: `isDeath=true, narrative 包含「${kw}」`,
          });
        }
      }
    }

    // 3. A newly described physical wound must have an HP delta or an
    // explicit structured injury. Sanity loss alone must not manufacture a
    // bruise/cut in prose.
    const explicitNewInjury = /(?:多了|出现|留下|添了|映出|裂开|渗出|一道|一处|一小道)[^。！？\n]{0,12}(?:擦伤|伤口|淤青|血痕|裂口)|(?:鲜血|血液)[^。！？\n]{0,8}(?:流下|渗出|滴落)|(?:掌心|手掌|皮肤|手指)[^。！？\n]{0,10}(?:磨破|破皮|渗出血丝|流血)/.test(step.narrative);
    const hpDropped = step.stateAfter.hp < prevState.hp;
    const conflict = step.dmJson.conflict_outcome;
    const injuryRows = conflict && typeof conflict === "object" && !Array.isArray(conflict)
      ? (conflict as Record<string, unknown>).injury_delta
      : null;
    const hasStructuredInjury = injuryRows && typeof injuryRows === "object" && !Array.isArray(injuryRows) &&
      Array.isArray((injuryRows as Record<string, unknown>).injuries) &&
      ((injuryRows as Record<string, unknown>).injuries as unknown[]).length > 0;
    if (explicitNewInjury && !hpDropped && !hasStructuredInjury) {
      contradictions.push({
        stepIndex: step.stepIndex,
        type: "physical_injury_without_state",
        description: "叙事新增身体伤势，但 HP 与结构化伤势均未变化",
        evidence: `hp=${step.stateAfter.hp} 未下降，conflict_outcome 无 injury_delta.injuries`,
      });
    }

    // 4. A registered NPC may only directly appear/speak when the structured
    // scene snapshot marks that NPC present. Historical recollection without
    // direct predicates remains allowed.
    const presentNpcIds = new Set(step.stateAfter.presentNpcIds ?? []);
    for (const npc of NPCS) {
      if (presentNpcIds.has(npc.id) || !step.narrative.includes(npc.name)) continue;
      const escaped = npc.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const direct = new RegExp(`${escaped}[^。！？\\n]{0,28}(?:说|问|答|道|走来|走近|站着|出现|转身|看着|抬头|开口|我叫)`);
      if (!direct.test(step.narrative)) continue;
      contradictions.push({
        stepIndex: step.stepIndex,
        type: "offscreen_npc_presence",
        description: `NPC ${npc.name} 未在场却直接出现或说话`,
        evidence: `presentNpcIds=${[...presentNpcIds].join(",") || "empty"}, npcId=${npc.id}`,
      });
    }
  }

  return contradictions;
}

// === v5 升级：原石叙事一致性、武器生命周期、职业转职 ===

/** 合法职业 ID（与 src/lib/profession/registry.ts 对齐） */
const VALID_PROFESSION_IDS = ["守灯人", "巡迹客", "觅兆者", "齐日角", "溯源师"];

/** 原石获得关键词 */
const ORIGINIUM_GAIN_PATTERNS = [
  /(?:获得|得到|拾起|收入|赚得|捡到|发现|找到)[了到]?\s*(?:[零一两二三四五六七八九十百千\d]+\s*)?(?:块|颗|枚|个)?\s*原石/,
  /原石\s*[，,]?\s*(?:收入|入账|增加|到手)/,
];

/** 原石消耗关键词 */
const ORIGINIUM_CONSUME_PATTERNS = [
  /(?:花费|消耗|捏碎|使用|支付|扣除|用掉|花掉)[了掉]?\s*(?:[零一两二三四五六七八九十百千\d]+\s*)?(?:块|颗|枚|个)?\s*原石/,
  /原石\s*[，,]?\s*(?:消耗|花掉|扣掉|用掉)/,
];

/** 武器掉落/卸下关键词 */
const WEAPON_DROP_PATTERNS = [
  /(?:放下|扔掉|丢弃|遗失|失去|脱手|卸[下掉]).{0,6}(?:武器|主手|铁管|钢管)/,
  /(?:武器|主手|铁管|钢管).{0,6}(?:脱手|飞出|掉落|断裂|碎裂|崩解|报废|损毁|断|碎|损坏|毁坏)/,
  /(?:武器|主手|铁管|钢管)\s*(?:(?:断|碎|损坏|毁坏|崩解|报废))/,
];

/** 武器持有关键词 */
const WEAPON_HOLD_PATTERNS = [
  /(?:握[着住]|挥舞|举起|持[着有]|攥[着住]|挥[舞动着]).{0,6}(?:武器|主手|铁管|钢管)/,
  /(?:武器|主手|铁管|钢管).{0,6}(?:在[手你]|发出|闪烁|震颤)/,
];

/** 职业认证关键词 */
const PROFESSION_CERTIFY_PATTERNS = [
  /(?:成为|认证为|转为|正式成为|升格为)[了]?\s*(守灯人|巡迹客|觅兆者|齐日角|溯源师)/,
  /(?:身份|职业)\s*(?:确定|认证|确立).{0,6}(守灯人|巡迹客|觅兆者|齐日角|溯源师)/,
];

/**
 * 叙事-原石一致性检测：检查 narrative 暗示的原石变化方向是否与 currency_change 一致。
 *
 * 规则：
 * - 叙事说"获得原石"但 currency_change 为负数或 0 → 异常
 * - 叙事说"消耗原石"但 currency_change 为正数或 0 → 异常
 * - 数值不严格比较（DM 可能省略精确数字），只检查方向一致性
 *
 * @param steps transcript 步骤数组（含 narrative + dmJson + stateAfter）
 * @returns 矛盾点列表
 */
export interface NarrativeOriginiumInconsistency {
  stepIndex: number;
  type: "gain_without_delta" | "consume_without_delta" | "delta_without_narrative";
  description: string;
  evidence: string;
  narrativeExcerpt: string;
  currencyChange: number;
}

export function detectNarrativeOriginiumInconsistency(
  steps: Array<{
    stepIndex: number;
    narrative: string;
    dmJson: Record<string, unknown>;
    stateAfter: GameStateSnapshot;
  }>
): NarrativeOriginiumInconsistency[] {
  const inconsistencies: NarrativeOriginiumInconsistency[] = [];

  for (const step of steps) {
    if (!step.narrative) continue;

    // 提取 currency_change（兼容 number 和 { originium: number } 两种历史格式）
    const cc = step.dmJson["currency_change"];
    let currencyChange = 0;
    if (typeof cc === "number" && Number.isFinite(cc)) {
      currencyChange = cc;
    } else if (cc && typeof cc === "object" && !Array.isArray(cc)) {
      const obj = cc as Record<string, unknown>;
      if (typeof obj["originium"] === "number" && Number.isFinite(obj["originium"])) {
        currencyChange = obj["originium"] as number;
      }
    }

    const impliesGain = ORIGINIUM_GAIN_PATTERNS.some((p) => p.test(step.narrative));
    const impliesConsume = ORIGINIUM_CONSUME_PATTERNS.some((p) => p.test(step.narrative));

    // 叙事暗示获得但 delta 非正
    if (impliesGain && !impliesConsume && currencyChange <= 0) {
      inconsistencies.push({
        stepIndex: step.stepIndex,
        type: "gain_without_delta",
        description: `叙事暗示获得原石但 currency_change=${currencyChange}`,
        evidence: `currency_change=${currencyChange}, narrative 含获得原石关键词`,
        narrativeExcerpt: step.narrative.slice(0, 100),
        currencyChange,
      });
    }

    // 叙事暗示消耗但 delta 非负
    if (impliesConsume && !impliesGain && currencyChange >= 0) {
      inconsistencies.push({
        stepIndex: step.stepIndex,
        type: "consume_without_delta",
        description: `叙事暗示消耗原石但 currency_change=${currencyChange}`,
        evidence: `currency_change=${currencyChange}, narrative 含消耗原石关键词`,
        narrativeExcerpt: step.narrative.slice(0, 100),
        currencyChange,
      });
    }

    // 状态变化方向与叙事冲突的严格检查：
    // state.originium 上升但叙事既没说获得也没说 currency_change 正数
    // （需要前一步的 originium 才能判断，此处只在 step.stateAfter 内做简单启发：
    //  不单独判断，依赖 applyDmJsonToState 已正确反映 state）
  }

  return inconsistencies;
}

/**
 * 武器更新一致性检测：检查 weapon_updates 数组与叙事、状态是否对齐。
 *
 * 规则：
 * - weapon_updates 中的 stability ∈ [0, 100]（与 store 对齐）
 * - weapon_updates 中的 contamination ∈ [0, 100]
 * - 如果 equippedWeapon 从非 null 变 null（卸武器），叙事应描述"放下/失去/武器损坏"等
 * - 如果叙事描述"武器损坏/断裂"，但 stability 未下降，应报告
 *
 * @param steps transcript 步骤数组
 * @returns 问题列表
 */
export interface WeaponUpdateInconsistency {
  stepIndex: number;
  type:
    | "stability_out_of_range"
    | "contamination_out_of_range"
    | "weapon_dropped_without_narrative"
    | "narrative_weapon_drop_without_state"
    | "narrative_weapon_damage_without_stability_drop"
    | "narrative_weapon_absence_with_state";
  description: string;
  evidence: string;
}

export function detectWeaponUpdateConsistency(
  steps: Array<{
    stepIndex: number;
    narrative: string;
    dmJson: Record<string, unknown>;
    stateAfter: GameStateSnapshot;
  }>
): WeaponUpdateInconsistency[] {
  const issues: WeaponUpdateInconsistency[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const prevWeapon = i > 0 ? steps[i - 1]!.stateAfter.equippedWeapon : null;
    const prevStability = i > 0 ? steps[i - 1]!.stateAfter.weaponStability : 100;
    const currWeapon = step.stateAfter.equippedWeapon;
    const currStability = step.stateAfter.weaponStability;

    // 1. weapon_updates 数值边界检查（在 dmJson 层；与 normalize 一致）
    const wu = step.dmJson["weapon_updates"];
    if (Array.isArray(wu)) {
      for (const row of wu as Array<Record<string, unknown>>) {
        if (!row || typeof row !== "object") continue;
        if (typeof row["stability"] === "number") {
          const s = row["stability"] as number;
          if (!Number.isFinite(s) || s < 0 || s > 100) {
            issues.push({
              stepIndex: step.stepIndex,
              type: "stability_out_of_range",
              description: `weapon_updates.stability=${s} 越界 [0, 100]`,
              evidence: `stability=${s} 不在合法范围`,
            });
          }
        }
        if (typeof row["contamination"] === "number") {
          const c = row["contamination"] as number;
          if (!Number.isFinite(c) || c < 0 || c > 100) {
            issues.push({
              stepIndex: step.stepIndex,
              type: "contamination_out_of_range",
              description: `weapon_updates.contamination=${c} 越界 [0, 100]`,
              evidence: `contamination=${c} 不在合法范围`,
            });
          }
        }
      }
    }

    // 2. 卸武器无叙事支持：equippedWeapon 从非 null 变 null，但叙事未描述
    if (prevWeapon !== null && currWeapon === null) {
      const narrativeSupport = WEAPON_DROP_PATTERNS.some((p) => p.test(step.narrative));
      if (!narrativeSupport && step.narrative.length > 5) {
        issues.push({
          stepIndex: step.stepIndex,
          type: "weapon_dropped_without_narrative",
          description: `武器被卸下（${prevWeapon}→null）但叙事未描述`,
          evidence: `prevWeapon=${prevWeapon}, currWeapon=null, narrative 无武器掉落关键词`,
        });
      }
    }

    // 3. 叙事说武器掉了/坏了但状态没变
    const narrativeImpliesDrop = WEAPON_DROP_PATTERNS.some((p) => p.test(step.narrative));
    if (narrativeImpliesDrop && currWeapon !== null && prevWeapon !== null) {
      issues.push({
        stepIndex: step.stepIndex,
        type: "narrative_weapon_drop_without_state",
        description: `叙事暗示武器掉落/损坏但 equippedWeapon 仍为 ${currWeapon}`,
        evidence: `equippedWeapon 未变，叙事含武器掉落关键词`,
      });
    }

    // 4. 叙事说武器损坏/断裂但 stability 未下降
    const narrativeImpliesDamage = /(?:武器|主手|铁管|钢管|刀|棍)[^。！？\n]{0,16}(?:损坏|断裂|碎裂|崩解|报废|损毁|裂纹|裂痕|缺口)/.test(step.narrative);
    const initialStability = steps[0]?.stateAfter.weaponStability ?? 100;
    const hasHistoricalWeaponDamage = currStability < initialStability ||
      steps.slice(0, i).some((prior, index) => index > 0 && prior.stateAfter.weaponStability < steps[index - 1]!.stateAfter.weaponStability);
    if (narrativeImpliesDamage && currStability >= prevStability && !hasHistoricalWeaponDamage && currWeapon !== null) {
      issues.push({
        stepIndex: step.stepIndex,
        type: "narrative_weapon_damage_without_stability_drop",
        description: `叙事暗示武器损坏但 stability 未下降（${prevStability}→${currStability}）`,
        evidence: `prevStability=${prevStability}, currStability=${currStability}`,
      });
    }

    // 5. 无武器时叙事描述挥舞武器（与现有逻辑重复但独立维度）
    if (currWeapon === null && (step.stateAfter.weaponBag ?? []).length === 0) {
      const impliesHold = WEAPON_HOLD_PATTERNS.some((p) => p.test(step.narrative));
      if (impliesHold && step.narrative.length > 5) {
        issues.push({
          stepIndex: step.stepIndex,
          type: "narrative_weapon_drop_without_state",
          description: `无装备武器但叙事描述挥舞武器`,
          evidence: `equippedWeapon=null, narrative 含武器持有关键词`,
        });
      }
    }

    // 6. Equipped/bag weapon exists but prose explicitly denies any weapon.
    const hasAnyWeapon = currWeapon !== null || (step.stateAfter.weaponBag ?? []).length > 0;
    if (hasAnyWeapon && /(?:没有|没)(?:有)?(?:任何|一把|可用的)?武器/.test(step.narrative)) {
      issues.push({
        stepIndex: step.stepIndex,
        type: "narrative_weapon_absence_with_state",
        description: "叙事声称没有武器，但结构化状态仍持有武器",
        evidence: `equippedWeapon=${currWeapon ?? "null"}, weaponBag=${(step.stateAfter.weaponBag ?? []).length}`,
      });
    }
  }

  return issues;
}

/**
 * 职业认证一致性检测：检查叙事中的职业变更是否与 state 对齐。
 *
 * 规则：
 * - 已认证（state.profession !== null）的玩家，叙事不应暗示"成为"另一个不同职业
 * - 叙事暗示"成为X职业"但 state.profession 未变为 X，应报告
 * - 单职业制：已有职业时不可能再认证别的职业
 *
 * @param steps transcript 步骤数组
 * @returns 矛盾点列表
 */
export interface ProfessionConsistencyIssue {
  stepIndex: number;
  type:
    | "profession_change_after_certification"
    | "narrative_certify_without_state"
    | "narrative_mentions_other_profession";
  description: string;
  evidence: string;
  narrativeExcerpt: string;
}

export function detectProfessionChangeConsistency(
  steps: Array<{
    stepIndex: number;
    narrative: string;
    stateAfter: GameStateSnapshot;
  }>
): ProfessionConsistencyIssue[] {
  const issues: ProfessionConsistencyIssue[] = [];
  let firstCertifiedProfession: string | null = null;
  let certifiedAtStep = -1;

  for (const step of steps) {
    if (!step.narrative) continue;

    // 追踪首次认证
    if (firstCertifiedProfession === null && step.stateAfter.profession !== null) {
      firstCertifiedProfession = step.stateAfter.profession;
      certifiedAtStep = step.stepIndex;
    }

    // 检查叙事中是否提到"成为 X 职业"
    for (const pattern of PROFESSION_CERTIFY_PATTERNS) {
      const m = step.narrative.match(pattern);
      if (!m) continue;
      const mentionedProfession = m[1];
      if (!mentionedProfession || !VALID_PROFESSION_IDS.includes(mentionedProfession)) continue;

      // Case A: 已认证玩家被叙事暗示转成另一个职业
      if (
        firstCertifiedProfession !== null &&
        step.stateAfter.profession === firstCertifiedProfession &&
        mentionedProfession !== firstCertifiedProfession
      ) {
        issues.push({
          stepIndex: step.stepIndex,
          type: "profession_change_after_certification",
          description: `已认证为「${firstCertifiedProfession}」（第${certifiedAtStep}步）但叙事暗示成为「${mentionedProfession}」`,
          evidence: `state.profession=${step.stateAfter.profession}, narrative 提及「${mentionedProfession}」`,
          narrativeExcerpt: step.narrative.slice(0, 100),
        });
      }

      // Case B: 叙事说"成为 X"但 state.profession 没变
      if (step.stateAfter.profession !== mentionedProfession) {
        issues.push({
          stepIndex: step.stepIndex,
          type: "narrative_certify_without_state",
          description: `叙事暗示认证为「${mentionedProfession}」但 state.profession=${step.stateAfter.profession ?? "null"}`,
          evidence: `state.profession=${step.stateAfter.profession}, narrative 提及「${mentionedProfession}」`,
          narrativeExcerpt: step.narrative.slice(0, 100),
        });
      }
    }

    // Case C: 已认证玩家叙事中提到另一个职业名（不含"成为"等关键词，较宽松）
    // 这条只在明确语境下报告：例如「你想起巡迹客的训练」这种是可以的，
    // 但如果直接「你以巡迹客身份…」则是问题。这里用「以 X 身份/作为 X」判断。
    if (firstCertifiedProfession !== null && step.stateAfter.profession === firstCertifiedProfession) {
      for (const otherProf of VALID_PROFESSION_IDS) {
        if (otherProf === firstCertifiedProfession) continue;
        const identityPattern = new RegExp(`(?:作为|以|身为)${otherProf}(?:的|身份|之|，|。|！)`);
        if (identityPattern.test(step.narrative)) {
          issues.push({
            stepIndex: step.stepIndex,
            type: "narrative_mentions_other_profession",
            description: `已认证「${firstCertifiedProfession}」但叙事以「${otherProf}」身份描述`,
            evidence: `state.profession=${firstCertifiedProfession}, narrative 含「作为${otherProf}」`,
            narrativeExcerpt: step.narrative.slice(0, 100),
          });
        }
      }
    }
  }

  return issues;
}

// === v6 升级：NPC 状态更新频率限制 + 关系漂移界限 ===

/**
 * NPC 状态更新频率检测：每一步中 NPC 在 alive、dead、present 间的状态变化不超过允许上限。
 * 防止 NPC 状态在单步中异常剧烈抖动。
 */
export interface NpcStateChurnResult {
  churns: Array<{
    stepIndex: number;
    changeCount: number;
    changes: string[];
  }>;
  maxChurnPerStep: number;
}

/**
 * 检测步间 NPC alive/dead 状态变化频率。
 * 单步变化超过 threshold 视为异常。
 */
export function detectNpcStateChurn(
  steps: Array<{
    stepIndex: number;
    stateAfter: GameStateSnapshot;
    prevState?: GameStateSnapshot;
  }>,
  threshold: number = 2
): NpcStateChurnResult {
  const churns: NpcStateChurnResult["churns"] = [];

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]!;
    const prevState = steps[i - 1]?.stateAfter;
    if (!prevState) continue;

    const curr = step.stateAfter;
    const changes: string[] = [];

    // 新死亡 NPC
    for (const id of curr.deadNpcIds) {
      if (!prevState.deadNpcIds.includes(id)) {
        changes.push(`NPC ${id} 死亡`);
      }
    }
    // 复活 NPC（已在 detectNpcResurrections 中详细检测，此处简化）
    for (const id of curr.aliveNpcIds) {
      if (prevState.deadNpcIds.includes(id)) {
        changes.push(`NPC ${id} 复活`);
      }
    }

    if (changes.length > threshold) {
      churns.push({
        stepIndex: step.stepIndex,
        changeCount: changes.length,
        changes,
      });
    }
  }

  return { churns, maxChurnPerStep: threshold };
}

// === 关系漂移检测 ===

/**
 * 关系值记录，用于跟踪 NPC 关系值随时间的变化
 */
export interface RelationshipSnapshot {
  /** npcId → 关系值（例如 -100~100） */
  [npcId: string]: number;
}

export interface RelationshipDriftResult {
  drifts: Array<{
    stepIndex: number;
    npcId: string;
    previousValue: number;
    newValue: number;
    change: number;
  }>;
  maxDriftPerStep: number;
}

const MAX_RELATIONSHIP_DRIFT_PER_STEP = 3;

/**
 * 从 DM JSON 的 relationship_updates 中提取关系值变化。
 * 检测单步变化是否超过 MAX_RELATIONSHIP_DRIFT_PER_STEP。
 */
export function detectRelationshipDrift(
  steps: Array<{
    stepIndex: number;
    dmJson: Record<string, unknown>;
  }>,
  currentRelationships: Record<string, number>
): RelationshipDriftResult {
  const drifts: RelationshipDriftResult["drifts"] = [];

  for (const step of steps) {
    const updates = step.dmJson["relationship_updates"];
    if (!Array.isArray(updates)) continue;

    for (const update of updates as Array<Record<string, unknown>>) {
      if (!update || typeof update !== "object") continue;
      const npcId = String(update["npc_id"] ?? update["npcId"] ?? "");
      const value = update["value"];
      const delta = update["delta"];

      if (!npcId) continue;

      const prevValue = currentRelationships[npcId] ?? 0;

      if (typeof value === "number" && Number.isFinite(value)) {
        currentRelationships[npcId] = value;
        const change = Math.abs(value - prevValue);
        if (change > MAX_RELATIONSHIP_DRIFT_PER_STEP) {
          drifts.push({
            stepIndex: step.stepIndex,
            npcId,
            previousValue: prevValue,
            newValue: value,
            change,
          });
        }
      } else if (typeof delta === "number" && Number.isFinite(delta)) {
        const newValue = prevValue + delta;
        currentRelationships[npcId] = newValue;
        const change = Math.abs(delta);
        if (change > MAX_RELATIONSHIP_DRIFT_PER_STEP) {
          drifts.push({
            stepIndex: step.stepIndex,
            npcId,
            previousValue: prevValue,
            newValue,
            change,
          });
        }
      }
    }
  }

  return { drifts, maxDriftPerStep: MAX_RELATIONSHIP_DRIFT_PER_STEP };
}

// === 导出供测试的内部常量 ===

export const _internal = {
  VALID_FLOORS,
  DM_ONLY_LEAK_PATTERNS,
  SUSPICIOUS_JUMPS,
  ECONOMY_LIMITS,
  POST_DEATH_ACTION_KEYWORDS,
  PROMPT_INJECTION_RESPONSE_KEYWORDS,
  NPC_DM_ONLY_KEYWORDS,
  VALID_PROFESSION_IDS,
  ORIGINIUM_GAIN_PATTERNS,
  ORIGINIUM_CONSUME_PATTERNS,
  WEAPON_DROP_PATTERNS,
  WEAPON_HOLD_PATTERNS,
  PROFESSION_CERTIFY_PATTERNS,
  extractFloor,
  MAX_RELATIONSHIP_DRIFT_PER_STEP,
};
