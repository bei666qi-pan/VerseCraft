/**
 * Combat Injury Integration — 将 resolveCombat 输出映射为生存伤势 delta
 *
 * 桥接函数：combatToInjuryDelta() 把 CombatResolution.explain.likelyCost
 * 翻译为 survivalCanon.ts 的伤势结构化 InjuryDelta。
 *
 * 供 resolveDmTurn.ts 在战斗决算后调用，把伤害 delta 写入 turnCommit
 * 的结构化字段供 store 消费。
 */

import type { CombatConflictKind, CombatResolution, CombatStyleTag } from "./types";
import type { InjurySeverity, InjuryType } from "@/lib/registry/survivalCanon";

// ──────────────────────────────────────
// 导出类型
// ──────────────────────────────────────

/** 伤势 delta 中的单个条目（不含 survivalCanon 的治疗数据） */
export interface CombatInjuryEntry {
  type: InjuryType;
  severity: InjurySeverity;
  /** 叙事描述来源——写进日志时使用 */
  source: string;
  /** 发生率 0..1：在需要随机判定时使用 */
  chance: number;
}

/** likelyCost → 伤势 delta 的结果载体 */
export interface InjuryDelta {
  injuries: CombatInjuryEntry[];
  /** 额外理智损失 */
  sanityDamage: number;
  /** 可叙事描述的伤害说明 */
  narrativeHint: string;
}

// ──────────────────────────────────────
// 内部映射表
// ──────────────────────────────────────

/** combatConflictKind → 默认伤害类型 */
const CONFLICT_INJURY: Record<CombatConflictKind, InjuryType> = {
  weapon_clash: "cut",
  shove: "bruise",
  subdue: "bruise",
  escape: "bruise",
  protect: "bruise",
  intimidate: "cognitive",
};

/** npcStyleTags 可产生的伤害类型覆盖。
 *  覆盖全部具名 CombatStyleTag，避免未映射风格静默走 conflictKind fallback。
 *  "unknown" 刻意不映射——未知风格应回退到 conflictKind 默认（更稳）。 */
const STYLE_INJURY: Partial<Record<CombatStyleTag, InjuryType>> = {
  mirror_counter: "cognitive",
  boundary_guard: "fracture",
  ambush: "cut",
  close_quarters: "bruise",
  tradecraft: "cognitive",      // 交易/契约式对抗——精神博弈与意志损耗
  medical_control: "cognitive", // 诊疗/麻痹/约束——神经与精神控制损伤
  utility_support: "bruise",    // 护送/掩护——钝击与撞击
  social_pressure: "cognitive", // 言语压迫/威慑——认知与精神压迫
};

/** 严重度降级表（安全区使用） */
const SEVERITY_DOWN: Record<InjurySeverity, InjurySeverity> = {
  fatal: "critical",
  critical: "severe",
  severe: "moderate",
  moderate: "minor",
  minor: "minor",
};

// ──────────────────────────────────────
// 内部 helpers
// ──────────────────────────────────────

/**
 * 从 conflictKind 和 npcStyleTags 推断最合适的伤害类型。
 * styleTags 取第一个匹配的覆盖，否则 fallback 到 conflictKind 默认映射。
 */
function inferType(
  kind: CombatConflictKind,
  styles?: CombatStyleTag[],
): InjuryType {
  const base = CONFLICT_INJURY[kind] ?? "bruise";
  if (styles) {
    for (const tag of styles) {
      const mapped = STYLE_INJURY[tag];
      if (mapped) return mapped;
    }
  }
  return base;
}

/** 根据 likelyCost 决定基础严重度 */
function _severityForCost(cost: "none" | "light" | "moderate" | "heavy"): InjurySeverity {
  switch (cost) {
    case "light": return "minor";
    case "moderate": return "moderate";
    case "heavy": return "severe";
    default: return "minor";
  }
}

/** 安全区内降一级严重度 */
function adjustSeverity(sev: InjurySeverity, safe: boolean): InjurySeverity {
  return safe ? (SEVERITY_DOWN[sev] ?? sev) : sev;
}

/** 伤害类型 → 来源描述 */
function sourceForType(type: InjuryType): string {
  const map: Record<InjuryType, string> = {
    cut: "利刃切割伤",
    bruise: "钝器冲击/撞击伤",
    fracture: "骨骼受损",
    burn: "烧伤/高温伤害",
    corrosion: "腐蚀性损伤",
    infection: "伤口感染",
    cognitive: "精神冲击/认知损伤",
    asphyxiation: "窒息伤害",
    poison: "中毒伤害",
    anomaly: "空间异常伤害",
  };
  return map[type] ?? "战斗伤害";
}

/** 根据 likelyCost 生成叙事提示 */
function narrativeForCost(cost: "none" | "light" | "moderate" | "heavy"): string {
  switch (cost) {
    case "none": return "战斗未造成实质伤害。";
    case "light": return "战斗造成了轻微伤势。";
    case "moderate": return "战斗造成了明显伤势，需要留意。";
    case "heavy": return "战斗造成了严重伤势，急需处理。";
  }
}

/** 根据 likelyCost 计算理智损失 */
function sanityForCost(cost: "none" | "light" | "moderate" | "heavy"): number {
  switch (cost) {
    case "none": return 0;
    case "light": return 1;
    case "moderate": return 2;
    case "heavy": return 4;
  }
}

/**
 * 在 heavy 模式下，将 bruise 等较弱的 injuryType 提升为更严重的对应类型。
 *
 * "severe" 级别的 bruise 叙事上不合理——严重撞击应表现为骨折或内伤。
 */
function promoteForHeavy(base: InjuryType): InjuryType {
  switch (base) {
    case "bruise": return "fracture";
    case "cut": return "cut";       // severe cut 合理（动脉受损）
    case "cognitive": return "cognitive"; // severe cognitive 合理（人格碎片）
    default: return base;
  }
}

// ──────────────────────────────────────
// 主出口函数
// ──────────────────────────────────────

/**
 * 将战斗决算（CombatResolution）翻译为结构化伤势 delta。
 *
 * @param resolution - resolveCombat 的输出
 * @param context - 额外上下文
 * @param context.conflictKind - 冲突种类（默认 "shove"）
 * @param context.isPlayerWinner - 玩家是否获胜（默认根据 winner 字段推断）
 * @param context.npcStyleTags - npc 风格标签（默认使用 resolution 已有标签）
 * @returns InjuryDelta
 */
export function combatToInjuryDelta(
  resolution: CombatResolution,
  context?: {
    conflictKind?: CombatConflictKind;
    isPlayerWinner?: boolean;
    npcStyleTags?: CombatStyleTag[];
  },
): InjuryDelta {
  const cost = resolution.explain.likelyCost;
  const safe = resolution.scene.isSafeZone;
  const kind = context?.conflictKind ?? "shove";
  const styles = context?.npcStyleTags ?? resolution.defender.styleTags;

  if (cost === "none") {
    return { injuries: [], sanityDamage: 0, narrativeHint: narrativeForCost(cost) };
  }

  const injuries: CombatInjuryEntry[] = [];
  const mainType = inferType(kind, styles);

  if (cost === "light") {
    injuries.push({
      type: mainType,
      severity: adjustSeverity("minor", safe),
      source: sourceForType(mainType),
      chance: 0.7,
    });
  }

  if (cost === "moderate") {
    injuries.push({
      type: mainType,
      severity: adjustSeverity("moderate", safe),
      source: sourceForType(mainType),
      chance: 0.8,
    });
    // 附带轻微瘀伤
    injuries.push({
      type: "bruise",
      severity: adjustSeverity("minor", safe),
      source: "战斗中的附带冲击",
      chance: 0.4,
    });
  }

  if (cost === "heavy") {
    const primaryType = promoteForHeavy(mainType);
    injuries.push({
      type: primaryType,
      severity: adjustSeverity("severe", safe),
      source: sourceForType(primaryType),
      chance: 0.9,
    });
    // 次级伤势
    injuries.push({
      type: mainType === "cognitive" ? "cognitive" : "bruise",
      severity: adjustSeverity("moderate", safe),
      source: sourceForType(mainType === "cognitive" ? "cognitive" : "bruise"),
      chance: 0.6,
    });
  }

  return {
    injuries,
    sanityDamage: sanityForCost(cost),
    narrativeHint: narrativeForCost(cost),
  };
}

/**
 * 轻量 wrapper：从 conflict_outcome envelope 的 likelyCost 字符串快速构造 InjuryDelta。
 *
 * 当只有 conflict_outcome 路径、没有完整 CombatResolution 时使用。
 * "unknown" 和 "none" 均回退为无伤害。
 *
 * @param likelyCost - conflict_outcome.likelyCost 的值
 * @param isSafeZone - 是否在安全区（默认为 false）
 * @param conflictKind - 冲突种类（默认 "shove"）
 * @returns InjuryDelta
 */
export function likelyCostToInjuryDelta(
  likelyCost: string,
  isSafeZone?: boolean,
  conflictKind?: CombatConflictKind,
): InjuryDelta {
  const cost: "none" | "light" | "moderate" | "heavy" =
    likelyCost === "light" ? "light" :
    likelyCost === "moderate" ? "moderate" :
    likelyCost === "heavy" ? "heavy" :
    "none"; // "none" / "unknown" / 其他 → 无伤害

  // 构建最小合成 CombatResolution
  const resolution: CombatResolution = {
    outcome: cost === "none" ? "stalemate" : "pressured",
    winner: "none",
    advantageBand: "even",
    attacker: {
      kind: "npc",
      actorId: "unknown",
      score: 10,
      breakdown: { base: 10, scene: 0, equipment: 0, psyche: 0, style: 0, total: 10, notes: [] },
      styleTags: [],
    },
    defender: {
      kind: "player",
      actorId: "player",
      score: 10,
      breakdown: { base: 10, scene: 0, equipment: 0, psyche: 0, style: 0, total: 10, notes: [] },
      styleTags: [],
    },
    scene: {
      locationId: "corridor",
      floorId: "1",
      threatPhase: "active",
      isSafeZone: isSafeZone ?? false,
      timeOfDay: "day",
      modifiers: { pressure: 0, concealment: 0, footing: 0 },
      notes: [],
    },
    explain: {
      why: ["likelyCost derived from conflict_outcome envelope"],
      likelyCost: cost,
      collateral: "none",
    },
  };

  return combatToInjuryDelta(resolution, { conflictKind });
}
