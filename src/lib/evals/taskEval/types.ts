/**
 * Task-based 端到端评测类型定义
 *
 * 设计理念（参考 SWE-bench）：
 * - 不测「AI 的回答对不对」，而测「AI 能不能把任务完成」
 * - 用游戏状态的客观变化作为评判器（物品增减、任务状态、位置变化等）
 * - 每个场景定义了初始状态、玩家行动序列、期望的最终状态
 */

import type { GameTaskStatus } from "@/lib/tasks/taskV2";
import type { QuestState } from "@/lib/tasks/taskStateMachine";

// === 任务场景定义 ===

/** 单个任务评测场景 */
export interface TaskEvalScenario {
  /** 唯一标识 */
  id: string;
  /** 场景名称 */
  name: string;
  /** 场景描述 */
  description: string;
  /** 难度等级 */
  difficulty: "basic" | "intermediate" | "advanced";
  /** 涉及的游戏系统 */
  systems: GameSystem[];
  /** 初始游戏状态 */
  initialState: TaskEvalGameState;
  /** 玩家行动序列 */
  playerActions: PlayerAction[];
  /** 期望的最终状态 */
  expectedOutcomes: ExpectedOutcome[];
  /** 场景说明和评判提示 */
  judgingNotes?: string;
}

/** 涉及的游戏系统 */
export type GameSystem =
  | "item" | "inventory" | "profession" | "weapon"
  | "originium" | "sanity" | "task" | "codex"
  | "location" | "npc" | "combat" | "talent"
  | "chapter" | "dialogue";

/** 玩家行动 */
export interface PlayerAction {
  /** 行动序号 */
  step: number;
  /** 玩家输入 */
  input: string;
  /** 期望的即时响应（可选，用于中间检查） */
  expectedResponse?: {
    minNarrativeChars?: number;
    mustContain?: string[];
    mustNotContain?: string[];
    /** 中间状态检查 */
    checkState?: Partial<TaskEvalGameState>;
  };
}

// === 游戏状态快照 ===

export interface TaskEvalGameState {
  // 玩家资源
  hp: number;
  maxHp: number;
  sanity: number;
  historicalMaxSanity: number;
  originium: number;

  // 行囊
  inventory: Array<{ id: string; name: string; quantity: number }>;
  maxInventorySlots: number;

  // 仓库
  warehouse: Array<{ id: string; name: string; quantity: number }>;

  // 职业
  profession: string | null;
  activeSkillName: string | null;
  activeSkillAvailable: boolean;
  activeSkillCooldown: number;

  // 武器
  equippedWeapon: string | null;
  weaponStability: number;
  weaponMaxStability: number;
  weaponCounter: string | null;

  // 天赋
  talent: string | null;
  talentCooldownRemaining: number;

  // 任务
  tasks: Array<{
    id: string;
    title: string;
    status: GameTaskStatus;
    issuerName?: string;
    questState?: QuestState;
  }>;

  // 位置
  playerLocation: string;
  currentFloor: string;

  // NPC
  presentNpcIds: string[];
  npcFavorability: Record<string, number>;

  // 图鉴
  codexNpcIds: string[];
  codexAnomalyNames: string[];

  // 章节
  chapterNumber: number;
  turnsInChapter: number;
  turnsRemaining: number;

  // 世界标记
  unlockedFlags: string[];

  // 是否死亡
  isDeath: boolean;
}

/** 期望的结果 */
export interface ExpectedOutcome {
  /** 检查类型 */
  type: OutcomeType;
  /** 描述 */
  description: string;
  /** 权重（用于计算总分） */
  weight: number;
  /** 具体的期望值 */
  expected: unknown;
  /** 容差（用于数值比较） */
  tolerance?: number;
}

export type OutcomeType =
  | "item_acquired"        // 物品获得
  | "item_consumed"        // 物品消耗
  | "item_count"           // 物品数量变化
  | "originium_changed"    // 原石变化
  | "originium_exact"      // 原石精确值
  | "sanity_changed"       // 理智变化
  | "sanity_in_range"      // 理智在范围内
  | "hp_changed"           // HP 变化
  | "task_status"          // 任务状态
  | "task_completed"       // 任务完成
  | "location_changed"     // 位置变化
  | "location_equals"      // 位置精确值
  | "npc_present"          // NPC 是否在场
  | "npc_favorability"     // NPC 好感度
  | "npc_favorability_changed" // NPC 好感度变化
  | "codex_entry_added"    // 图鉴条目增加
  | "profession_changed"   // 职业变化
  | "weapon_equipped"      // 武器装备
  | "weapon_stability"     // 武器稳定度
  | "flag_unlocked"        // 标记解锁
  | "death_occurred"       // 死亡事件
  | "narrative_contains"   // 叙事包含
  | "narrative_not_contains" // 叙事不包含
  | "dm_json_field"        // DM JSON 字段检查
  // 以下为离线模式乐观通过的高级场景 outcome（live judge 会精确检查）
  | "decision_choice_honored"
  | "task_count_unchanged"
  | "no_new_task_assigned"
  | "narrative_downgrade_handled"
  | "options_provided"
  | "option_count_valid"
  | "options_no_duplicates"
  | "economic_tradeoff_reflected"
  | "trust_improved"
  | "combat_avoided"
  | "stealth_successful"
  | "faction_reaction_shown"
  | "narrative_consequence"
  | "narrative_moral_reflected"
  | "weapon_broken"
  | "improvised_weapon"
  | "combat_outcome_affected"
  | "narrative_tension"
  | "narrative_discovery"
  | "trade_negotiation_narrated"
  | "relationship_update"
  | "narrative_distortion_reflected"
  | "inventory_slot_count"
  | "narrative_tradeoff_shown"
  | "lore_delivered"
  | "npc_reaction_personality"
  | "narrative_depth";

// === 评测结果 ===

/** 单个结果的检查结果 */
export interface OutcomeCheckResult {
  type: OutcomeType;
  description: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  weight: number;
  detail?: string;
}

/** 单个场景的评测结果 */
export interface TaskEvalScenarioResult {
  scenarioId: string;
  scenarioName: string;
  difficulty: string;
  passed: boolean;
  /** 得分 0-1 */
  score: number;
  /** 通过的检查数 / 总检查数 */
  checksPassed: number;
  checksTotal: number;
  /** 逐项检查结果 */
  outcomes: OutcomeCheckResult[];
  /** 各步骤的中间结果 */
  stepResults: StepResult[];
  /** 最终游戏状态 */
  finalState: Partial<TaskEvalGameState>;
  /** 耗时 ms */
  durationMs: number;
  /** 失败原因汇总 */
  failures: string[];
}

/** 单步执行结果 */
export interface StepResult {
  step: number;
  input: string;
  narrative: string;
  dmJson: Record<string, unknown>;
  stateAfter: Partial<TaskEvalGameState>;
  passed: boolean;
  failures: string[];
}

// === 批次评测 ===

export interface TaskEvalRunConfig {
  /** 场景列表 */
  scenarios: TaskEvalScenario[];
  /** 是否使用 mock（离线模式） */
  mockMode: boolean;
  /** API base URL */
  baseUrl?: string;
  /** 超时 ms */
  timeoutMs: number;
  /** 是否执行中间步骤检查 */
  checkIntermediateSteps: boolean;
  /** 失败场景是否继续 */
  continueOnFailure: boolean;
}

export interface TaskEvalRunSummary {
  config: Omit<TaskEvalRunConfig, "scenarios">;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  passRate: number;
  averageScore: number;
  /** 按难度分组的统计 */
  byDifficulty: Record<string, { total: number; passed: number; rate: number }>;
  /** 按系统分组的统计 */
  bySystem: Record<string, { total: number; passed: number; rate: number }>;
  /** 详细结果 */
  results: TaskEvalScenarioResult[];
  /** 总耗时 */
  durationMs: number;
  /** gate 判定 */
  gatePass: boolean;
}

// === 工具函数 ===

/** 创建默认的游戏状态（用于场景定义的起点） */
export function createDefaultGameState(overrides?: Partial<TaskEvalGameState>): TaskEvalGameState {
  return {
    hp: 10,
    maxHp: 10,
    sanity: 80,
    historicalMaxSanity: 100,
    originium: 3,
    inventory: [
      { id: "item_phone", name: "手机", quantity: 1 },
      { id: "item_bandage", name: "绷带", quantity: 2 },
    ],
    maxInventorySlots: 8,
    warehouse: [],
    profession: "调查员",
    activeSkillName: "现场还原",
    activeSkillAvailable: true,
    activeSkillCooldown: 0,
    equippedWeapon: "警用手电",
    weaponStability: 72,
    weaponMaxStability: 100,
    weaponCounter: "目眩",
    talent: "生命汇源",
    talentCooldownRemaining: 0,
    tasks: [
      { id: "tutorial_investigate", title: "调查走廊异常", status: "active", issuerName: "廖暗", questState: "active" },
    ],
    playerLocation: "旧公寓三楼走廊",
    currentFloor: "3F",
    presentNpcIds: ["npc_liao_an"],
    npcFavorability: { "npc_liao_an": 35, "npc_lin_ze": 15, "npc_old_liu": 10 },
    codexNpcIds: ["npc_liao_an"],
    codexAnomalyNames: [],
    chapterNumber: 1,
    turnsInChapter: 5,
    turnsRemaining: 15,
    unlockedFlags: ["tutorial_complete"],
    isDeath: false,
    ...overrides,
  };
}

/** 比较两个值是否匹配（支持容差） */
export function valuesMatch(expected: unknown, actual: unknown, tolerance?: number): boolean {
  if (typeof expected === "number" && typeof actual === "number") {
    const tol = tolerance ?? 0;
    return Math.abs(expected - actual) <= tol;
  }
  if (typeof expected === "string" && typeof actual === "string") {
    return expected === actual;
  }
  if (typeof expected === "boolean" && typeof actual === "boolean") {
    return expected === actual;
  }
  // 数组比较
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return false;
    return expected.every((item, i) => valuesMatch(item, actual[i], tolerance));
  }
  // 对象浅比较
  if (typeof expected === "object" && typeof actual === "object" && expected !== null && actual !== null) {
    return JSON.stringify(expected) === JSON.stringify(actual);
  }
  return expected === actual;
}
