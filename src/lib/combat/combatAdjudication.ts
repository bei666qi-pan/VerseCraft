import type { StatType, Weapon } from "@/lib/registry/types";
import type { CodexEntry } from "@/store/useGameStore";
import { computePlayerCombatScore } from "./playerCombatScore";
import { getHiddenNpcCombatProfile, type HiddenNpcCombatProfile } from "./npcCombatProfiles";
import { resolveCombat } from "./resolveCombat";
import type {
  CombatActorScore,
  CombatConflictKind,
  CombatPrecheck,
  CombatResolution,
  CombatStyleTag,
  HiddenNpcCombatProfileV1,
  MainThreatPhase,
  SceneCombatContext,
} from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function safeNum(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function computeNpcCombatScore(args: {
  npc: HiddenNpcCombatProfileV1;
  scene: SceneCombatContext;
  /** NPC 的“临场状态”仅做轻量输入（不引入随机） */
  injured?: "none" | "light" | "heavy";
  outnumbered?: boolean;
  surprised?: boolean;
}): CombatActorScore {
  const p = args.npc;
  const injuredPenalty = args.injured === "heavy" ? -2.2 : args.injured === "light" ? -1.0 : 0;
  const outnumberedPenalty = args.outnumbered ? -0.9 : 0;
  const surprisedPenalty = args.surprised ? -0.7 : 0;

  // basePower 是“强度底色”，其余轴用于解释与稳定性，而不是把它变成 RPG 面板
  const base = safeNum(p.basePower);
  const discipline = clamp01(p.discipline);
  const resilience = clamp01(p.resilience);

  // psyche：纪律与抗压会在高压相位更关键（但不做剧烈跳变）
  const phaseBias =
    args.scene.threatPhase === "breached" ? 1.0 :
    args.scene.threatPhase === "active" ? 0.6 :
    args.scene.threatPhase === "suppressed" ? -0.2 :
    0;
  const psyche = clamp((discipline - 0.5) * 1.6 + (resilience - 0.5) * 1.8 + phaseBias * 0.35, -2.5, 2.6);

  // scene：直接吃 scene.modifiers（可解释且可复用），但保持克制
  const scene = clamp(args.scene.modifiers.pressure * 0.45 + args.scene.modifiers.concealment * 0.25 + args.scene.modifiers.footing * 0.25, -1.4, 1.6);

  const total = clamp(base * 0.85 + psyche + scene + injuredPenalty + outnumberedPenalty + surprisedPenalty, 0, 60);

  const notes: string[] = [];
  if (discipline >= 0.72) notes.push("动作很克制：少失手，少夸张破坏。");
  if (resilience >= 0.72) notes.push("抗压强：高压相位不容易崩。");
  if (args.injured === "heavy") notes.push("状态不佳：动作完成度下降。");
  if (args.outnumbered) notes.push("人数处于劣势：更难稳住位置。");
  if (args.surprised) notes.push("被打了个措手不及：窗口更窄。");

  return {
    kind: "npc",
    actorId: p.npcId,
    score: total,
    breakdown: {
      base: base * 0.85,
      equipment: 0,
      psyche,
      scene,
      style: 0,
      total,
      notes,
    },
    styleTags: (p.styleTags ?? []).slice(0, 3) as CombatStyleTag[],
  };
}

export function buildHiddenNpcCombatProfile(args: {
  npcId: string;
  codex?: Record<string, CodexEntry> | null;
}): HiddenNpcCombatProfile {
  const entry = args.codex ? args.codex[args.npcId] ?? null : null;
  return getHiddenNpcCombatProfile({ npcId: args.npcId, codexEntry: entry });
}

export function computeCombatPrecheck(args: {
  attacker: CombatActorScore;
  defender: CombatActorScore;
  defenderDangerForPlayer: CombatPrecheck["dangerForPlayer"];
  scene: SceneCombatContext;
  kind: CombatConflictKind;
}): CombatPrecheck {
  const delta = (args.attacker.score - args.defender.score) + clamp(args.scene.modifiers.pressure * 0.25, -0.8, 0.9);
  const explain: string[] = [];
  if (args.scene.isSafeZone) explain.push("安全区更容易把冲突压成短促可控的退让。");
  if (args.scene.threatPhase === "breached") explain.push("威胁失控时，容错更低。");
  if (args.kind === "weapon_clash") explain.push("器械冲突更容易互伤，别恋战。");

  const verdict =
    delta <= -6.2 ? "avoid" :
    delta <= -2.8 ? "risky" :
    delta < 1.2 ? "contested" :
    delta < 3.0 ? "favorable" :
    "favorable";

  if (verdict === "avoid") explain.push("差距过大：正面硬顶更像赌命。");
  if (verdict === "risky") explain.push("风险很高：就算扛住也容易出代价。");
  if (verdict === "contested") explain.push("势均力敌：胜负取决于一步退路或一次失误。");
  if (verdict === "favorable") explain.push("你更容易把冲突压成可控的一步。");

  return { verdict, dangerForPlayer: args.defenderDangerForPlayer, explain };
}

export function buildActorPostureLayers(score: CombatActorScore): {
  staticBedrock: string;
  dynamicPosture: string;
} {
  const b = score.breakdown;
  const staticBedrock =
    b.base + b.psyche >= 8
      ? "底色稳定：长期能力能支撑短促对抗。"
      : b.base + b.psyche >= 4
        ? "底色一般：能抗一两步，但不适合硬拖。"
        : "底色偏弱：长期硬拼容易被反咬。";
  const dynamicPosture =
    b.scene >= 1.2
      ? "当前态势向你倾斜：有可利用窗口。"
      : b.scene >= 0.2
        ? "当前态势轻微有利：需要精确拿位。"
        : b.scene > -0.8
          ? "当前态势拉扯：谁先失位谁吃亏。"
          : "当前态势不利：优先止损与脱离。";
  return { staticBedrock, dynamicPosture };
}

export function adjudicateCombat(args: {
  kind: CombatConflictKind;
  scene: SceneCombatContext;
  attacker:
    | { kind: "player"; stats: Record<StatType, number> | null | undefined; equippedWeapon: Weapon | null | undefined; threatPhase: MainThreatPhase; knowsWeakness?: boolean; allyCount?: number; initiative?: "none" | "soft" | "hard"; footingQuality?: "good" | "ok" | "bad" }
    | { kind: "npc"; npc: HiddenNpcCombatProfileV1; injured?: "none" | "light" | "heavy"; outnumbered?: boolean; surprised?: boolean };
  defender:
    | { kind: "player"; stats: Record<StatType, number> | null | undefined; equippedWeapon: Weapon | null | undefined; threatPhase: MainThreatPhase; knowsWeakness?: boolean; allyCount?: number; initiative?: "none" | "soft" | "hard"; footingQuality?: "good" | "ok" | "bad" }
    | { kind: "npc"; npc: HiddenNpcCombatProfileV1; injured?: "none" | "light" | "heavy"; outnumbered?: boolean; surprised?: boolean };
}): CombatResolution {
  const attackerScore =
    args.attacker.kind === "player"
      ? computePlayerCombatScore({
          stats: args.attacker.stats,
          equippedWeapon: args.attacker.equippedWeapon,
          threatPhase: args.attacker.threatPhase,
          footingQuality: args.attacker.footingQuality,
          knowsWeakness: args.attacker.knowsWeakness,
          allyCount: args.attacker.allyCount,
          initiative: args.attacker.initiative,
        })
      : computeNpcCombatScore({
          npc: args.attacker.npc,
          scene: args.scene,
          injured: args.attacker.injured,
          outnumbered: args.attacker.outnumbered,
          surprised: args.attacker.surprised,
        });

  const defenderScore =
    args.defender.kind === "player"
      ? computePlayerCombatScore({
          stats: args.defender.stats,
          equippedWeapon: args.defender.equippedWeapon,
          threatPhase: args.defender.threatPhase,
          footingQuality: args.defender.footingQuality,
          knowsWeakness: args.defender.knowsWeakness,
          allyCount: args.defender.allyCount,
          initiative: args.defender.initiative,
        })
      : computeNpcCombatScore({
          npc: args.defender.npc,
          scene: args.scene,
          injured: args.defender.injured,
          outnumbered: args.defender.outnumbered,
          surprised: args.defender.surprised,
        });

  return resolveCombat({
    attacker: attackerScore,
    defender: defenderScore,
    scene: args.scene,
    kind: args.kind,
  });
}

