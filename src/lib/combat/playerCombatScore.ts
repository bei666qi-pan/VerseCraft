import type { Weapon, StatType } from "@/lib/registry/types";
import type { ProfessionId } from "@/lib/profession/types";
import type { MainThreatPhase, CombatActorScore, CombatScoreBreakdown, CombatConflictKind, CombatStyleTag } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function statVal(stats: Record<StatType, number> | null | undefined, k: StatType): number {
  const v = stats?.[k];
  return Number.isFinite(v) ? Number(v) : 0;
}

/** Stage-3 武器阶级加成：阶级越高，底子越扎实（轻量，避免数值碾压）。 */
const WEAPON_TIER_SCORE: Record<string, number> = { C: 0, B: 0.6, A: 1.2, S: 2 };

function weaponCounterMatchBonus(
  weapon: Weapon,
  opponentVulnerableTags: string[] | undefined
): { bonus: number; matched: boolean } {
  if (!opponentVulnerableTags || opponentVulnerableTags.length === 0) return { bonus: 0, matched: false };
  const tagPool = new Set<string>(
    [
      ...(Array.isArray(weapon.counterTags) ? weapon.counterTags : []),
      ...(Array.isArray((weapon as any).currentMods) ? ((weapon as any).currentMods as unknown[]) : []),
    ].map((x) => String(x).toLowerCase())
  );
  const matched = opponentVulnerableTags.some((t) => tagPool.has(String(t).toLowerCase()));
  // “用对武器”窗口：比笼统的 knowsWeakness 更具体，给稍高权重。
  return { bonus: matched ? 1.6 : 0, matched };
}

function weaponEquipmentScore(
  weapon: Weapon | null | undefined,
  opponentVulnerableTags?: string[]
): { equipment: number; notes: string[] } {
  if (!weapon) return { equipment: 0, notes: ["未装备武器：更依赖走位与退路。"] };
  const st = Number.isFinite((weapon as any).stability) ? Number((weapon as any).stability) : null;
  const contamination = Number.isFinite((weapon as any).contamination) ? Number((weapon as any).contamination) : null;
  const repairable = typeof (weapon as any).repairable === "boolean" ? Boolean((weapon as any).repairable) : null;
  const infusions = Array.isArray((weapon as any).currentInfusions) ? ((weapon as any).currentInfusions as unknown[]) : [];
  const tier = typeof (weapon as any).tier === "string" ? String((weapon as any).tier) : null;
  const hasEffectSource = Boolean(
    (weapon as any).effectSource && typeof (weapon as any).effectSource === "object"
  );

  // 只做轻量影响：稳定性不足与污染会显著拖后腿；小幅考虑 infusion 作为“适配性”
  const stabilityPenalty = st === null ? 0 : st >= 70 ? 0 : st >= 55 ? -1 : st >= 40 ? -2 : -3;
  const contaminationPenalty = contamination === null ? 0 : contamination < 20 ? 0 : contamination < 40 ? -1 : contamination < 60 ? -2 : -3;
  const infusionBonus = infusions.length >= 2 ? 2 : infusions.length === 1 ? 1 : 0;
  const repairableBonus = repairable === false ? -1 : 0;
  // Stage-3：阶级与“继承道具效果”不再只是展示字段，真正进入战力计算。
  const tierBonus = tier && WEAPON_TIER_SCORE[tier] !== undefined ? WEAPON_TIER_SCORE[tier]! : 0;
  const effectSourceBonus = hasEffectSource ? 0.4 : 0;
  const { bonus: counterBonus, matched: counterMatched } = weaponCounterMatchBonus(weapon, opponentVulnerableTags);

  const equipment =
    stabilityPenalty + contaminationPenalty + infusionBonus + repairableBonus + tierBonus + effectSourceBonus + counterBonus;
  const notes: string[] = [];
  if (st !== null && st < 55) notes.push("武器不稳：出手更容易失控或卡壳。");
  if (contamination !== null && contamination >= 40) notes.push("污染偏高：更难维持干净利落的对抗。");
  if (infusions.length > 0) notes.push("有过浸润改造：对特定威胁更“对味”。");
  if (tier === "A" || tier === "S") notes.push("高阶武器：底子更扎实。");
  if (counterMatched) notes.push("这把武器的路数正好克制对方：你抓住了一个明确窗口。");
  return { equipment, notes };
}

function threatPhasePressure(phase: MainThreatPhase): number {
  // active/breached 压迫更高，压缩容错
  if (phase === "idle") return 0;
  if (phase === "suppressed") return -0.5;
  if (phase === "active") return 0.8;
  return 1.2; // breached
}

/** 职业与冲突类型的“对味”关系：不是数值碾压，只是让身份在战术上有稳定差异。 */
const PROFESSION_KIND_AFFINITY: Partial<Record<ProfessionId, CombatConflictKind[]>> = {
  守灯人: ["subdue", "weapon_clash", "protect"],
  巡迹客: ["escape"],
  齐日角: ["intimidate", "shove"],
  溯源师: ["weapon_clash"],
};

/** 职业对应的战斗风格锚点（用于解释文案，不做数值碾压）。 */
const PROFESSION_STYLE_TAG: Record<ProfessionId, CombatStyleTag> = {
  守灯人: "boundary_guard",
  巡迹客: "ambush",
  觅兆者: "mirror_counter",
  齐日角: "tradecraft",
  溯源师: "utility_support",
};

function professionCombatContribution(args: {
  profession: ProfessionId | null | undefined;
  activeEngaged: boolean | undefined;
  kind: CombatConflictKind | undefined;
}): { bonus: number; notes: string[] } {
  if (!args.profession) return { bonus: 0, notes: [] };
  const notes: string[] = [];
  // 已认证身份：小幅、恒定的“更稳”加成（不是数值碾压，只是有身份支撑）。
  let bonus = 0.5;
  const affinity = PROFESSION_KIND_AFFINITY[args.profession] ?? [];
  if (args.kind && affinity.includes(args.kind)) {
    bonus += 1.0;
    notes.push("职业倾向与当前应对方式契合：处理得更像“懂行的人”。");
  }
  if (args.activeEngaged) {
    bonus += 1.2;
    notes.push("职业主动已发动：这一步更容易被你稳住。");
  }
  return { bonus, notes };
}

function derivePlayerStyleTags(args: { profession?: ProfessionId | null; weapon?: Weapon | null }): CombatStyleTag[] {
  const tags: CombatStyleTag[] = [];
  if (args.profession && PROFESSION_STYLE_TAG[args.profession]) tags.push(PROFESSION_STYLE_TAG[args.profession]!);
  const mods = Array.isArray((args.weapon as any)?.currentMods) ? ((args.weapon as any).currentMods as unknown[]) : [];
  const modSet = new Set(mods.map((x) => String(x).toLowerCase()));
  if (modSet.has("mirror")) tags.push("mirror_counter");
  if (modSet.has("grappling")) tags.push("close_quarters");
  if (tags.length === 0) tags.push("close_quarters");
  return [...new Set(tags)].slice(0, 3);
}

export function computePlayerCombatScore(args: {
  stats: Record<StatType, number> | null | undefined;
  equippedWeapon: Weapon | null | undefined;
  threatPhase: MainThreatPhase;
  /** 位置/退路是否清晰（由 scene context 给出，先留轻量输入） */
  footingQuality?: "good" | "ok" | "bad";
  /** 是否掌握对方弱点（结构化信号，不是“必胜”开关） */
  knowsWeakness?: boolean;
  /** 人数优势：同伴数量（0..3）；不做无限堆叠 */
  allyCount?: number;
  /** 是否先手（例如伏击/提前卡位） */
  initiative?: "none" | "soft" | "hard";
  /** 已认证职业（Stage-4：让职业真正进入战力计算，而不是与战斗系统平行） */
  profession?: ProfessionId | null;
  /** 本回合职业主动是否已发动（consumeProfessionActiveForTurn 的消费结果） */
  professionActiveEngaged?: boolean;
  /** 冲突类型（用于职业倾向匹配的“对味”判定） */
  kind?: CombatConflictKind;
  /** 对方风格弱点标签（来自 CombatStyleDefinitionV1.vulnerableToTags）：武器命中即为“用对武器” */
  opponentVulnerableTags?: string[];
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

  const { equipment, notes: eqNotes } = weaponEquipmentScore(args.equippedWeapon, args.opponentVulnerableTags);
  const { bonus: professionBonus, notes: professionNotes } = professionCombatContribution({
    profession: args.profession,
    activeEngaged: args.professionActiveEngaged,
    kind: args.kind,
  });

  const knowsWeaknessBonus = args.knowsWeakness ? 0.8 : 0;
  const ally = Math.max(0, Math.min(3, Math.trunc(args.allyCount ?? 0)));
  // 人数优势：递减收益，且不把战斗变成“堆队友就赢”
  const allyBonus = ally === 0 ? 0 : ally === 1 ? 0.7 : ally === 2 ? 1.0 : 1.2;
  const initBonus = args.initiative === "hard" ? 1.0 : args.initiative === "soft" ? 0.45 : 0;

  const footing =
    args.footingQuality === "good" ? 0.8 : args.footingQuality === "bad" ? -0.9 : 0;

  const scene = threatPhasePressure(args.threatPhase) + footing;

  const total = clamp(
    base + psyche + equipment + scene + knowsWeaknessBonus + allyBonus + initBonus + professionBonus,
    0,
    60
  );
  const breakdown: CombatScoreBreakdown = {
    base,
    scene: scene + knowsWeaknessBonus + allyBonus + initBonus,
    equipment,
    psyche,
    style: professionBonus,
    total,
    notes: [
      ...eqNotes,
      ...professionNotes,
      ...(args.footingQuality === "bad" ? ["退路不清：更容易被逼到墙角。"] : []),
      ...(args.knowsWeakness ? ["掌握对方弱点：动作更敢收束到有效窗口。"] : []),
      ...(ally > 0 ? [`有人在侧：人数优势（${ally}）更容易逼出退路窗口。`] : []),
      ...(args.initiative && args.initiative !== "none" ? ["先手在握：更容易把冲突压成短促有效的一步。"] : []),
      ...(args.threatPhase === "active" || args.threatPhase === "breached" ? ["威胁相位升高：容错更低。"] : []),
    ],
  };

  return {
    kind: "player",
    actorId: "player",
    score: total,
    breakdown,
    styleTags: derivePlayerStyleTags({ profession: args.profession, weapon: args.equippedWeapon }),
  };
}
