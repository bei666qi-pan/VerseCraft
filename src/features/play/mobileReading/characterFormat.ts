import type { StatType } from "@/lib/registry/types";
import type { ProfessionId } from "@/lib/profession/types";
import { STAT_MAX } from "../playConstants";

export function formatMobileCharacterTime(time: { day?: number; hour?: number } | null | undefined): string {
  const day = Number.isFinite(time?.day) ? Math.trunc(Number(time?.day)) : 0;
  const hour = Number.isFinite(time?.hour) ? Math.trunc(Number(time?.hour)) : 0;
  return `第 ${Math.max(0, day)} 日 · ${String(Math.max(0, hour)).padStart(2, "0")}:00`;
}

export function formatMobileCharacterProfession(profession: ProfessionId | null | undefined): string {
  return profession ?? "无";
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
