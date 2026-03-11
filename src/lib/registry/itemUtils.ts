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

/** Parchment has no stat requirements (tutorial item) */
export const PARCHMENT_ID = "I-PARCHMENT";

/**
 * Check if player can use item based on stat requirements.
 * Parchment (I-PARCHMENT) always passes.
 */
export function canUseItem(item: Item, stats: Record<StatType, number>): { ok: boolean; reason?: string } {
  if (item.id === PARCHMENT_ID) return { ok: true };
  const req = item.statRequirements;
  if (!req || Object.keys(req).length === 0) return { ok: true };

  const entries = Object.entries(req) as [StatType, number][];
  for (const [stat, min] of entries) {
    const val = stats[stat] ?? 0;
    if (val < min) {
      return { ok: false, reason: `${STAT_LABELS[stat]}不足（需要${min}，当前${val}）` };
    }
  }
  return { ok: true };
}

/**
 * Format stat requirements for UI display.
 */
export function formatStatRequirements(item: Item): string | null {
  if (item.id === PARCHMENT_ID) return null;
  const req = item.statRequirements;
  if (!req || Object.keys(req).length === 0) return null;

  const parts = (Object.entries(req) as [StatType, number][]).map(
    ([stat, min]) => `${STAT_LABELS[stat]}≥${min}`
  );
  return parts.join("，");
}

export { STAT_ORDER, STAT_LABELS };
