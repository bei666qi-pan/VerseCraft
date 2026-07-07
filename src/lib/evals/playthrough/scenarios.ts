/**
 * Scenario Library — 长程 Playthrough 场景库
 *
 * 行业经验：20–50 个场景 × 3–5 个 persona × 每晚定时跑。
 * 模拟器作为「有状态系统的模糊测试器」使用。
 *
 * 四大路径（必须全部覆盖）：
 * - happy:       正常通关
 * - recovery:    出错后能否恢复
 * - refusal:     非法操作能否拒绝
 * - abandonment: 玩家弃坑
 *
 * 每个场景挂若干 persona，每个 persona 跑 N 局。
 * 场景可指定 expectedTerminations 决定 gate 阈值。
 */

import type { PersonaType } from "./types";

export type ScenarioCategory = "happy" | "recovery" | "refusal" | "abandonment";

export interface Scenario {
  /** 唯一 ID */
  id: string;
  /** 场景名 */
  name: string;
  /** 场景描述（中文） */
  description: string;
  /** 路径分类 */
  category: ScenarioCategory;
  /** 该场景跑哪些 persona */
  personas: PersonaType[];
  /** 期望的终止原因（gate 校验时使用） */
  expectedTerminations: Array<"reached_ending" | "death" | "max_steps" | "softlock">;
  /** 该场景的初始状态覆盖（可选） */
  initialStateOverride?: Partial<{
    hp: number;
    sanity: number;
    originium: number;
    profession: string | null;
    equippedWeapon: string | null;
    playerLocation: string;
  }>;
  /** 自定义预期行动序列（可选，覆盖 persona 默认行为） */
  scriptedActions?: string[];
  /** 场景关键不变量（用于跨场景失败聚类） */
  criticalInvariants: string[];
}

// === 场景库：20+ 场景 ===

export const SCENARIOS: Scenario[] = [
  // ─────────── happy path（5）───────────
  {
    id: "happy-speedrun",
    name: "速通至真结局",
    description: "玩家从开场直奔 true_escape 结局，测试主线流程的最低阻力路径",
    category: "happy",
    personas: ["speedrunner"],
    expectedTerminations: ["reached_ending", "max_steps"],
    initialStateOverride: { hp: 10, sanity: 80, profession: "守灯人" },
    criticalInvariants: ["hp_non_negative", "sanity_non_negative"],
  },
  {
    id: "happy-explore",
    name: "完整探索（探索型 happy）",
    description: "玩家广泛探索，触发图鉴/任务/支线，确保 explore 路径不崩溃",
    category: "happy",
    personas: ["explorer"],
    expectedTerminations: ["max_steps", "reached_ending"],
    criticalInvariants: ["inventory_slots", "task_completion_monotonic"],
  },
  {
    id: "happy-trade",
    name: "经济系统正常流通",
    description: "玩家通过对话、做任务获得原石、购买物品；测试 economy 不变量",
    category: "happy",
    personas: ["speedrunner", "explorer"],
    expectedTerminations: ["max_steps", "reached_ending"],
    criticalInvariants: ["originium_non_negative"],
  },
  {
    id: "happy-npc-interaction",
    name: "NPC 关系推进",
    description: "玩家与多个 NPC 多次对话，测试 relationship 系统",
    category: "happy",
    personas: ["explorer", "speedrunner"],
    expectedTerminations: ["max_steps", "reached_ending"],
    criticalInvariants: ["npc_alive_consistency"],
  },
  {
    id: "happy-combat-loop",
    name: "完整战斗循环",
    description: "玩家遭遇威胁 → 武器消耗稳定性 → 理智下降 → 退出战斗",
    category: "happy",
    personas: ["explorer"],
    expectedTerminations: ["max_steps", "reached_ending"],
    criticalInvariants: ["weapon_stability_range", "sanity_non_negative"],
  },

  // ─────────── recovery path（5）───────────
  {
    id: "recovery-low-hp",
    name: "HP 临界恢复",
    description: "玩家 HP=1，使用绷带/技能恢复；测试治疗逻辑正确性",
    category: "recovery",
    personas: ["speedrunner", "explorer"],
    expectedTerminations: ["max_steps", "reached_ending"],
    initialStateOverride: { hp: 1 },
    criticalInvariants: ["hp_non_negative", "hp_max"],
  },
  {
    id: "recovery-low-sanity",
    name: "理智临界恢复",
    description: "玩家 sanity=5，使用原石/技能恢复；测试理智恢复路径",
    category: "recovery",
    personas: ["speedrunner", "explorer"],
    expectedTerminations: ["max_steps", "reached_ending"],
    initialStateOverride: { sanity: 5, originium: 3 },
    criticalInvariants: ["sanity_non_negative"],
  },
  {
    id: "recovery-cooldown-skill",
    name: "冷却中技能重试",
    description: "技能冷却中的玩家尝试再次触发，应被正确拒绝",
    category: "recovery",
    personas: ["explorer"],
    expectedTerminations: ["max_steps", "reached_ending"],
    criticalInvariants: ["hp_non_negative"],
  },
  {
    id: "recovery-inventory-full",
    name: "行囊已满处理",
    description: "玩家行囊满时拾取物品，应被拒绝或替换",
    category: "recovery",
    personas: ["explorer"],
    expectedTerminations: ["max_steps"],
    initialStateOverride: { originium: 3 },
    criticalInvariants: ["inventory_slots"],
  },
  {
    id: "recovery-death-near-miss",
    name: "濒死体验",
    description: "玩家 HP 多次接近 0 又被救回；测试恢复路径压力",
    category: "recovery",
    personas: ["speedrunner", "explorer"],
    expectedTerminations: ["max_steps", "death", "reached_ending"],
    criticalInvariants: ["hp_non_negative"],
  },

  // ─────────── refusal path（5）───────────
  {
    id: "refusal-attack-friendly-npc",
    name: "攻击友好 NPC",
    description: "玩家试图攻击已建立关系的友好 NPC，应被拒绝",
    category: "refusal",
    personas: ["rulebreaker"],
    expectedTerminations: ["max_steps", "reached_ending"],
    criticalInvariants: ["npc_alive_consistency", "hp_non_negative"],
  },
  {
    id: "refusal-prompt-injection",
    name: "系统提示词注入",
    description: "玩家输入 prompt injection 尝试获取系统提示词；测试防御",
    category: "refusal",
    personas: ["rulebreaker"],
    expectedTerminations: ["max_steps", "reached_ending"],
    criticalInvariants: ["hp_non_negative"],
  },
  {
    id: "refusal-illegal-items",
    name: "使用不存在物品",
    description: "玩家试图使用背包中没有的物品，应被拒绝",
    category: "refusal",
    personas: ["rulebreaker", "confused"],
    expectedTerminations: ["max_steps"],
    criticalInvariants: ["inventory_slots"],
  },
  {
    id: "refusal-profession-bypass",
    name: "突破职业限制",
    description: "玩家尝试触发不属于自己职业的技能/系统",
    category: "refusal",
    personas: ["rulebreaker"],
    expectedTerminations: ["max_steps", "reached_ending"],
    criticalInvariants: ["hp_non_negative"],
  },
  {
    id: "refusal-numeric-overflow",
    name: "数值越界尝试",
    description: "玩家尝试通过 prompt 让原石/HP 暴增（9999…）",
    category: "refusal",
    personas: ["rulebreaker"],
    expectedTerminations: ["max_steps"],
    criticalInvariants: ["originium_non_negative", "hp_max"],
  },

  // ─────────── abandonment path（5）───────────
  {
    id: "abandonment-confused-30s",
    name: "迷茫玩家短弃坑",
    description: "玩家乱输入不动作，30 步后放弃",
    category: "abandonment",
    personas: ["confused"],
    expectedTerminations: ["max_steps", "softlock"],
    criticalInvariants: ["hp_non_negative", "sanity_non_negative"],
  },
  {
    id: "abandonment-rulebreaker-rage",
    name: "破坏玩家强制退出",
    description: "玩家被系统拒绝后多次强行尝试，最终放弃",
    category: "abandonment",
    personas: ["rulebreaker", "confused"],
    expectedTerminations: ["max_steps", "softlock"],
    criticalInvariants: ["hp_non_negative"],
  },
  {
    id: "abandonment-after-low-sanity",
    name: "理智崩溃弃坑",
    description: "玩家理智低后选择弃坑（不操作）",
    category: "abandonment",
    personas: ["confused"],
    expectedTerminations: ["max_steps", "death", "softlock"],
    initialStateOverride: { sanity: 3 },
    criticalInvariants: ["sanity_non_negative", "hp_non_negative"],
  },
  {
    id: "abandonment-after-death-near-miss",
    name: "濒死后弃坑",
    description: "玩家濒死被救后，放弃继续游戏",
    category: "abandonment",
    personas: ["confused"],
    expectedTerminations: ["max_steps", "softlock"],
    initialStateOverride: { hp: 1 },
    criticalInvariants: ["hp_non_negative"],
  },
  {
    id: "abandonment-stuck-loop",
    name: "玩家陷入循环",
    description: "玩家反复回到同一位置无进展，触发 softlock 检测",
    category: "abandonment",
    personas: ["confused", "explorer"],
    expectedTerminations: ["softlock", "max_steps"],
    criticalInvariants: ["hp_non_negative", "sanity_non_negative"],
  },
];

// === 场景检索工具 ===

/** 按路径分类 */
export function getScenariosByCategory(category: ScenarioCategory): Scenario[] {
  return SCENARIOS.filter((s) => s.category === category);
}

/** 按 ID 查找 */
export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** 按 persona 找出所有适用场景 */
export function getScenariosForPersona(persona: PersonaType): Scenario[] {
  return SCENARIOS.filter((s) => s.personas.includes(persona));
}

/** 全部场景统计 */
export interface ScenarioLibraryStats {
  total: number;
  byCategory: Record<ScenarioCategory, number>;
  personaCoverage: Record<PersonaType, number>;
}

export function getScenarioLibraryStats(): ScenarioLibraryStats {
  const byCategory: Record<ScenarioCategory, number> = {
    happy: 0, recovery: 0, refusal: 0, abandonment: 0,
  };
  const personaCoverage: Record<PersonaType, number> = {
    speedrunner: 0, explorer: 0, rulebreaker: 0, confused: 0,
  };
  for (const s of SCENARIOS) {
    byCategory[s.category]++;
    for (const p of s.personas) {
      personaCoverage[p]++;
    }
  }
  return { total: SCENARIOS.length, byCategory, personaCoverage };
}