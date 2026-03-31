import type { Weapon, StatType } from "@/lib/registry/types";
import type { MainThreatPhase, CombatActorScore, CombatScoreBreakdown } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function statVal(stats: Record<StatType, number> | null | undefined, k: StatType): number {
  const v = stats?.[k];
  return Number.isFinite(v) ? Number(v) : 0;
}

function weaponEquipmentScore(weapon: Weapon | null | undefined): { equipment: number; notes: string[] } {
  if (!weapon) return { equipment: 0, notes: ["未装备武器：更依赖走位与退路。"] };
  const st = Number.isFinite((weapon as any).stability) ? Number((weapon as any).stability) : null;
  const contamination = Number.isFinite((weapon as any).contamination) ? Number((weapon as any).contamination) : null;
  const repairable = typeof (weapon as any).repairable === "boolean" ? Boolean((weapon as any).repairable) : null;
  const infusions = Array.isArray((weapon as any).currentInfusions) ? ((weapon as any).currentInfusions as unknown[]) : [];

  // 只做轻量影响：稳定性不足与污染会显著拖后腿；小幅考虑 infusion 作为“适配性”
  const stabilityPenalty = st === null ? 0 : st >= 70 ? 0 : st >= 55 ? -1 : st >= 40 ? -2 : -3;
  const contaminationPenalty = contamination === null ? 0 : contamination < 20 ? 0 : contamination < 40 ? -1 : contamination < 60 ? -2 : -3;
  const infusionBonus = infusions.length >= 2 ? 2 : infusions.length === 1 ? 1 : 0;
  const repairableBonus = repairable === false ? -1 : 0;

  const equipment = stabilityPenalty + contaminationPenalty + infusionBonus + repairableBonus;
  const notes: string[] = [];
  if (st !== null && st < 55) notes.push("武器不稳：出手更容易失控或卡壳。");
  if (contamination !== null && contamination >= 40) notes.push("污染偏高：更难维持干净利落的对抗。");
  if (infusions.length > 0) notes.push("有过浸润改造：对特定威胁更“对味”。");
  return { equipment, notes };
}

function threatPhasePressure(phase: MainThreatPhase): number {
  // active/breached 压迫更高，压缩容错
  if (phase === "idle") return 0;
  if (phase === "suppressed") return -0.5;
  if (phase === "active") return 0.8;
  return 1.2; // breached
}

export function computePlayerCombatScore(args: {
  stats: Record<StatType, number> | null | undefined;
  equippedWeapon: Weapon | null | undefined;
  threatPhase: MainThreatPhase;
  /** 位置/退路是否清晰（由 scene context 给出，先留轻量输入） */
  footingQuality?: "good" | "ok" | "bad";
}): CombatActorScore {
  const sanity = statVal(args.stats, "sanity");
  const agility = statVal(args.stats, "agility");
  const luck = statVal(args.stats, "luck");
  const charm = statVal(args.stats, "charm");
  const background = statVal(args.stats, "background");

  // base：不是“固定战力”，而是把可解释的能力面向压缩成一个区间
  // 目标：第一版可解释、可测试、足够轻
  const base = 3 + agility * 0.25 + background * 0.12 + luck * 0.12;

  // psyche：精神/魅力影响的是“在压力下能否把动作做完”
  const psyche = clamp((sanity - 10) * 0.12 + (charm - 10) * 0.06, -2.5, 2.5);

  const { equipment, notes: eqNotes } = weaponEquipmentScore(args.equippedWeapon);

  const footing =
    args.footingQuality === "good" ? 0.8 : args.footingQuality === "bad" ? -0.9 : 0;

  const scene = threatPhasePressure(args.threatPhase) + footing;

  const total = clamp(base + psyche + equipment + scene, 0, 60);
  const breakdown: CombatScoreBreakdown = {
    base,
    scene,
    equipment,
    psyche,
    style: 0,
    total,
    notes: [
      ...eqNotes,
      ...(args.footingQuality === "bad" ? ["退路不清：更容易被逼到墙角。"] : []),
      ...(args.threatPhase === "active" || args.threatPhase === "breached" ? ["威胁相位升高：容错更低。"] : []),
    ],
  };

  return {
    kind: "player",
    actorId: "player",
    score: total,
    breakdown,
    styleTags: ["close_quarters"],
  };
}

