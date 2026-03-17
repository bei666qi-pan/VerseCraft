// src/lib/registry/itemUtils.ts
// Item usage checks and owner resolution

import type { Item, StatType } from "./types";

const STAT_ORDER: StatType[] = ["sanity", "agility", "luck", "charm", "background"];
const STAT_LABELS: Record<StatType, string> = {
  sanity: "理智",
  agility: "敏捷",
  luck: "幸运",
  charm: "魅力",
  background: "出身",
};

/** Effect type labels for intuitive display */
export const EFFECT_TYPE_LABELS: Record<string, string> = {
  shield: "护盾",
  ruleKill: "规则击杀",
  tempStat: "临时属性",
  tempFavor: "好感加成",
  transform: "幻形",
  purify: "净化",
  key: "开锁",
  bait: "诱饵",
  binding: "束缚",
  consumable: "消耗品",
};

/**
 * Get concise effect summary for Item. Uses effectSummary if present, else derives from effectType.
 */
export function getItemEffectSummary(item: Item | null | undefined): string | null {
  if (!item || typeof item !== "object") return null;
  if (item.effectSummary && item.effectSummary.trim()) return item.effectSummary.trim();
  const t = item.effectType;
  if (!t) return null;
  if (t === "shield") return item.blockLethal && item.ruleKill ? "抵挡1次致命攻击或施加规则击杀" : "抵挡1次致命攻击";
  if (t === "ruleKill") return "可对诡异施加规则类致命一击";
  if (t === "tempStat" && item.tempStatEffect) {
    const { stat, value } = item.tempStatEffect;
    const s = STAT_LABELS[stat] ?? stat;
    return value >= 0 ? `${s}+${value}` : `${s}${value}`;
  }
  if (t === "tempFavor") return `好感+${item.tempFavorEffect ?? "?"}`;
  if (t === "transform") return "幻形为指定角色";
  if (t === "purify") return "净化污染/驱散低阶诡异";
  if (t === "key") return "开门/解锁";
  if (t === "bait") return "吸引诡异注意，争取撤离";
  if (t === "binding") return "束缚诡异短暂时间";
  if (t === "consumable") return "一次性使用（恢复/修正属性）";
  return EFFECT_TYPE_LABELS[t] ?? t;
}

/**
 * Check if player can use item based on stat requirements.
 * Defensive: returns false if item or stats are invalid (hydration/SSR safety).
 */
export function canUseItem(
  item: Item | null | undefined,
  stats: Record<StatType, number> | null | undefined
): { ok: boolean; reason?: string } {
  if (!item || typeof item !== "object") return { ok: false, reason: "无效道具" };
  const safeStats = stats ?? {};
  const req = item.statRequirements;
  if (!req || typeof req !== "object" || Object.keys(req).length === 0) return { ok: true };

  const entries = Object.entries(req) as [StatType, number][];
  for (const [stat, min] of entries) {
    const val = safeStats[stat] ?? 0;
    if (val < min) {
      return { ok: false, reason: `${STAT_LABELS[stat]}不足（需要${min}，当前${val}）` };
    }
  }
  return { ok: true };
}

/**
 * Format stat requirements for UI display.
 * Defensive: returns null if item is invalid (hydration/SSR safety).
 */
export function formatStatRequirements(item: Item | null | undefined): string | null {
  if (!item || typeof item !== "object") return null;
  const req = item.statRequirements;
  if (!req || typeof req !== "object" || Object.keys(req).length === 0) return null;

  const parts = (Object.entries(req) as [StatType, number][]).map(
    ([stat, min]) => `${STAT_LABELS[stat]}≥${min}`
  );
  return parts.join("，");
}

export { STAT_ORDER, STAT_LABELS };
