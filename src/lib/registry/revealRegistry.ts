/**
 * 揭露层元数据 + 可执行门闸规则（由 playerContext 解析信号驱动）。
 */

import type { PlayerWorldSignals } from "./playerWorldSignals";
import { REVEAL_TIER_RANK, type RevealTierId, type RevealTierRank } from "./revealTierRank";

export interface RevealTierMeta {
  id: RevealTierId;
  title: string;
  unlockSignals: string[];
  revealPolicy: string;
}

export const REVEAL_TIER_METAS: readonly RevealTierMeta[] = [
  {
    id: "surface",
    title: "表层传言",
    unlockSignals: ["初入 B1", "低后果探索", "未触发深层标记"],
    revealPolicy:
      "仅可生存规则、公寓传言与矛盾线索；高魅力 NPC 只呈现职能壳（物业/B1/交易等）。不解释龙胃、回声体根因、七锚、校源身份或循环纠错。玩家仅以口语追问（如「你们是不是同学」）而未满足 worldFlags/进度信号时，不得抬高 reveal，不得用 deep 包代答。",
  },
  {
    id: "fracture",
    title: "裂缝真相",
    unlockSignals: ["次日以后", "复活或推进标记", "主威胁压制进展", "较高图鉴好感"],
    revealPolicy:
      "可给机制切片：锚点代价、原石社会功能、楼层阶段感。可暗示数名关键住户「不像普通徘徊者」与职能—记忆耦合违和；仍不可直述七锚、校源标签、十日闪烁全貌。",
  },
  {
    id: "deep",
    title: "深层机制",
    unlockSignals: ["7F 锚或身处 7F", "阴谋类世界标记", "职业认证线索"],
    revealPolicy:
      "可谈七锚结构、学制循环窗口、校源徘徊者运行态、龙月校准与泄露—收容双端因果；仍不直给通关步骤与出口对账链。",
  },
  {
    id: "abyss",
    title: "深渊对账",
    unlockSignals: ["B2 现身", "出口类世界标记"],
    revealPolicy: "允许对齐根因果、出口代价与七锚在终筛中的可能结算；禁止因单句追问一次性倾倒全部设定。",
  },
] as const;

/** 兼容 bootstrap / 旧文档字段名 */
export const REVEAL_TIERS = REVEAL_TIER_METAS.map((m) => ({
  id: m.id,
  title: m.title,
  unlockSignals: m.unlockSignals,
  revealPolicy: m.revealPolicy,
}));

function bump(rank: RevealTierRank, min: RevealTierRank): RevealTierRank {
  return rank < min ? min : rank;
}

export interface RevealGateRule {
  id: string;
  /** 满足时至少抬到该层级 */
  bumpTo: RevealTierRank;
  when: (s: PlayerWorldSignals) => boolean;
}

/**
 * 规则按顺序求 max；同一信号可匹配多条，结果取最高 bumpTo。
 * 扩展时只追加规则，避免改 imperative 大块逻辑。
 * 注意：不得根据「玩家上一句台词」抬档；只认 playerContext 解析出的持久信号与世界标记。
 */
export const REVEAL_GATE_RULES: readonly RevealGateRule[] = [
  { id: "day_ge_2", bumpTo: REVEAL_TIER_RANK.fracture, when: (s) => s.day >= 2 },
  { id: "dark_moon_window", bumpTo: REVEAL_TIER_RANK.fracture, when: (s) => s.day >= 3 },
  {
    id: "revive_or_ff",
    bumpTo: REVEAL_TIER_RANK.fracture,
    when: (s) => s.hasReviveLine || s.worldFlags.includes("reviveFastForward12h"),
  },
  { id: "death_ge_1", bumpTo: REVEAL_TIER_RANK.fracture, when: (s) => s.deathCount >= 1 },
  {
    id: "threat_suppressed",
    bumpTo: REVEAL_TIER_RANK.fracture,
    when: (s) => s.anyThreatSuppressedOrBreached,
  },
  {
    id: "codex_trust_ge_55",
    bumpTo: REVEAL_TIER_RANK.fracture,
    when: (s) => s.maxCodexFavorability >= 55,
  },
  {
    id: "floor_progress_ge_4",
    bumpTo: REVEAL_TIER_RANK.fracture,
    when: (s) => (s.residentialFloorNum ?? 0) >= 4 || s.historicalMaxFloorScore >= 40,
  },
  {
    id: "conspiracy_flags",
    bumpTo: REVEAL_TIER_RANK.deep,
    when: (s) =>
      /conspiracy|manager_truth|deep_lore|elder|truth_seed/i.test(s.worldFlags.join(",")),
  },
  {
    id: "anchor_7f_or_on_7f",
    bumpTo: REVEAL_TIER_RANK.deep,
    when: (s) => s.anchor7F || s.is7F,
  },
  {
    id: "profession_certified",
    bumpTo: REVEAL_TIER_RANK.deep,
    when: (s) => s.professionAnyCertified && Boolean(s.professionCurrent),
  },
  {
    id: "on_b2",
    bumpTo: REVEAL_TIER_RANK.abyss,
    when: (s) => s.isB2,
  },
  {
    id: "exit_world_flags",
    bumpTo: REVEAL_TIER_RANK.abyss,
    when: (s) => /b2_unlocked|abyss_line|dragon_anchor|exit_truth/i.test(s.worldFlags.join(",")),
  },
];

export function computeMaxRevealRankFromSignals(s: PlayerWorldSignals): RevealTierRank {
  let r: RevealTierRank = REVEAL_TIER_RANK.surface;
  for (const rule of REVEAL_GATE_RULES) {
    if (rule.when(s)) r = bump(r, rule.bumpTo);
  }
  return r;
}

export function listFiredRevealRuleIds(s: PlayerWorldSignals): string[] {
  return REVEAL_GATE_RULES.filter((rule) => rule.when(s)).map((r) => r.id);
}
