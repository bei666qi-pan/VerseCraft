import type { StatType } from "@/lib/registry/types";
import type { ProfessionId } from "@/lib/profession/types";
import { ENGLISH_PROFESSION_LABELS } from "@/lib/i18n/gameDisplay";
import type { GameLanguage } from "@/lib/i18n/language";
import { STAT_MAX } from "../playConstants";

export function formatMobileCharacterTime(time: { day?: number; hour?: number } | null | undefined, language: GameLanguage = "zh-CN"): string {
  const day = Number.isFinite(time?.day) ? Math.trunc(Number(time?.day)) : 0;
  const hour = Number.isFinite(time?.hour) ? Math.trunc(Number(time?.hour)) : 0;
  const safeDay = Math.max(0, day);
  const timeLabel = `${String(Math.max(0, hour)).padStart(2, "0")}:00`;
  return language === "en-US" ? `Day ${safeDay} · ${timeLabel}` : `第 ${safeDay} 日 · ${timeLabel}`;
}

export function formatMobileCharacterProfession(
  profession: ProfessionId | null | undefined,
  language: GameLanguage = "zh-CN"
): string {
  if (!profession) return language === "en-US" ? "None" : "无";
  return language === "en-US" ? ENGLISH_PROFESSION_LABELS[profession] ?? profession : profession;
}

export function getMobileCharacterUpgradeCost(stats: Record<StatType, number>): number {
  const totalPoints =
    (stats.sanity ?? 0) +
    (stats.agility ?? 0) +
    (stats.luck ?? 0) +
    (stats.charm ?? 0) +
    (stats.background ?? 0);
  return totalPoints < 20 ? 2 : 3;
}

export function canUpgradeMobileCharacterAttribute(
  stat: StatType,
  stats: Record<StatType, number>,
  originium: number
): boolean {
  const current = stats[stat] ?? 0;
  if (current >= STAT_MAX) return false;
  return originium >= getMobileCharacterUpgradeCost(stats);
}
