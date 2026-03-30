/**
 * 月初误入：硬规则（结构化），非单句 lore。
 * 与 spaceShardCanon.school_into_apartment_monthly 对齐。
 */

import { MAJOR_NPC_IDS } from "./majorNpcDeepCanon";

export const MONTHLY_INTRUSION_RULE_ID = "monthly_student_spillover" as const;

/** 游戏世界内可引用的节律事实（packet / prompt） */
export const MONTHLY_INTRUSION_HARD_RULES = {
  ruleId: MONTHLY_INTRUSION_RULE_ID,
  /** 是否随现实历法：叙事默认「每个游戏月开端」薄弱窗口 */
  cadence: "game_month_opening_window",
  /** 谁受影响：校外学生泡层 → 公寓裸露泡层 */
  typicalVictimProfile: "student_from_daily_bubble",
  /** 住户侧共识强度 */
  residentAwareness: "common_knowledge_among_ordinary_npcs",
  /** 多数结局（叙事基线，非剧透主角） */
  typicalOutcome: "panic_wander_then_loss",
  /** 主角差异仅在于表现，非血统 */
  protagonistDifferentiator: "calmer_demeanor_not_destiny",
} as const;

export const MONTHLY_INTRUSION_RESIDENT_BASELINE = {
  /** 普通 NPC 默认真命题（对白可用） */
  knowsMonthlyStudentsExist: true,
  /** 默认不把误入者当旧友 */
  defaultRecognizesAsOldFriend: false,
  /** 悲观预期：可配置档位 partial = 有人观望/有人利用 */
  expectsNewcomerToDieSoon: "usually_yes_some_exceptions" as const,
  /** 先当「又一个误入者」再当谜题 */
  interactionPriority: "treat_as_intruded_student_first",
} as const;

/**
 * 是否适用「月初误入常识」基线：全体非高魅力、非夜读老人。
 */
export function isMonthlyIntrusionNpcCommonSense(npcId: string | null | undefined): boolean {
  const id = String(npcId ?? "").trim();
  if (!id) return true;
  if (id === "N-011") return false;
  if (MAJOR_NPC_IDS.includes(id as (typeof MAJOR_NPC_IDS)[number])) return false;
  return true;
}

/** 供 buildLoreContextForDM / 文档块 */
export function buildMonthlyIntrusionCommonSenseLines(): string[] {
  return [
    "【月初误入·住户共识】每个游戏月开端，边界薄弱，常有穿学生气的外人掉进 B1 一带；对老住户而言不稀奇。",
    "【预后口径】多数人慌、跑、乱试规则，很快没了动静；偶尔有人多撑几天，也别当奇迹宣传。",
    "【对主角默认】先当作又一批误入的学生之一；冷静一点不意味着天命，只意味着你可能多听见半句真话。",
  ];
}
