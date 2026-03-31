import type { SnapshotMainThreatState } from "@/lib/state/snapshot/types";
import type { ProfessionEvidenceKey, ProfessionId, ProfessionProgress, ProfessionStateV1 } from "./types";
import { PROFESSION_IDS, PROFESSION_REGISTRY, createDefaultProfessionState } from "./registry";
import type { StatType, Weapon } from "@/lib/registry/types";
import { getProfessionTrialTaskId } from "./trials";
import { getProfessionImprintFlag } from "./imprint";

type TaskLite = { id: string; status: "active" | "completed" | "failed" | "hidden" | "available" };
type CodexLite = { type: "npc" | "anomaly"; favorability?: number };

function safeNum(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function countCompletedTasks(tasks: TaskLite[]): number {
  return (tasks ?? []).filter((t) => t.status === "completed").length;
}

function countSuppressedThreats(map: Record<string, SnapshotMainThreatState>): number {
  return Object.values(map ?? {}).filter((x) => x.phase === "suppressed").length;
}

function hasHighSuppressionProgress(map: Record<string, SnapshotMainThreatState>, minProgress: number): boolean {
  return Object.values(map ?? {}).some((x) => safeNum((x as any).suppressionProgress) >= minProgress);
}

function countNpcCodexEntries(codex: Record<string, CodexLite>): number {
  return Object.values(codex ?? {}).filter((x) => x.type === "npc").length;
}

function countAnomalyCodexEntries(codex: Record<string, CodexLite>): number {
  return Object.values(codex ?? {}).filter((x) => x.type === "anomaly").length;
}

function countHighFavorabilityNpcs(codex: Record<string, CodexLite>, minFavorability: number): number {
  return Object.values(codex ?? {}).filter((x) => x.type === "npc" && safeNum(x.favorability) >= minFavorability).length;
}

function statQualified(stats: Record<StatType, number>, stat: StatType, min: number): boolean {
  return safeNum(stats?.[stat]) >= min;
}

function weaponHasDiscipline(w: Weapon | null): boolean {
  if (!w) return false;
  const stability = safeNum((w as any).stability);
  const contamination = safeNum((w as any).contamination);
  return stability >= 65 && contamination <= 45;
}

function weaponHasModOrInfusion(w: Weapon | null): boolean {
  if (!w) return false;
  const mods = Array.isArray((w as any).currentMods) ? (w as any).currentMods : [];
  const infusions = Array.isArray((w as any).currentInfusions) ? (w as any).currentInfusions : [];
  return mods.length > 0 || infusions.length > 0;
}

function taskExists(tasks: TaskLite[], id: string): TaskLite | null {
  if (!id) return null;
  return (tasks ?? []).find((t) => t.id === id) ?? null;
}

function codexHasNpc(codex: Record<string, CodexLite>, npcId: string): boolean {
  if (!npcId) return false;
  const entry = (codex ?? {})[npcId];
  return Boolean(entry && entry.type === "npc");
}

function computeBehaviorEvidenceKeys(profession: ProfessionId, input: {
  tasks: TaskLite[];
  historicalMaxFloorScore: number;
  mainThreatByFloor: Record<string, SnapshotMainThreatState>;
  codex: Record<string, CodexLite>;
  inventoryCount: number;
  warehouseCount: number;
  equippedWeapon: Weapon | null;
}): ProfessionEvidenceKey[] {
  const completedTasks = countCompletedTasks(input.tasks);
  const suppressed = countSuppressedThreats(input.mainThreatByFloor);
  const hasSupp60 = hasHighSuppressionProgress(input.mainThreatByFloor, 60);
  const npcCodex = countNpcCodexEntries(input.codex);
  const anomalyCodex = countAnomalyCodexEntries(input.codex);
  const highFavNpc = countHighFavorabilityNpcs(input.codex, 10);
  const weaponDisc = weaponHasDiscipline(input.equippedWeapon);
  const weaponModInf = weaponHasModOrInfusion(input.equippedWeapon);

  const keys: ProfessionEvidenceKey[] = [];

  if (profession === "守灯人") {
    if (suppressed > 0 || hasSupp60) keys.push("threat_suppression_window");
    if (weaponDisc) keys.push("weapon_discipline");
    if (completedTasks >= 2) keys.push("threat_pressure_survival");
    return keys;
  }
  if (profession === "巡迹客") {
    if (safeNum(input.historicalMaxFloorScore) >= 2) keys.push("mobility_progress");
    if (completedTasks >= 2) keys.push("escape_discipline");
    if (weaponModInf) keys.push("weapon_discipline");
    return keys;
  }
  if (profession === "觅兆者") {
    if (anomalyCodex >= 2) keys.push("anomaly_codex_work");
    if (weaponModInf) keys.push("omen_validation");
    if (completedTasks >= 2) keys.push("omen_validation");
    return keys;
  }
  if (profession === "齐日角") {
    if (npcCodex >= 3) keys.push("negotiation_results");
    if (highFavNpc >= 1) keys.push("relationship_growth");
    if (completedTasks >= 2) keys.push("negotiation_results");
    return keys;
  }
  // 溯源师
  if (safeNum(input.warehouseCount) >= 3) keys.push("forge_maintenance");
  if (weaponDisc || weaponModInf) keys.push("weapon_discipline");
  if (anomalyCodex >= 2) keys.push("truth_chain_progress");
  return keys;
}

export function computeProfessionState(input: {
  prev: ProfessionStateV1 | undefined;
  stats: Record<StatType, number>;
  tasks: TaskLite[];
  historicalMaxFloorScore: number;
  mainThreatByFloor: Record<string, SnapshotMainThreatState>;
  codex: Record<string, CodexLite>;
  inventoryCount: number;
  warehouseCount: number;
  equippedWeapon: Weapon | null;
}): ProfessionStateV1 {
  const base = input.prev ?? createDefaultProfessionState();
  const progressByProfession = { ...base.progressByProfession } as Record<ProfessionId, ProfessionProgress>;
  const eligibilityByProfession = { ...base.eligibilityByProfession } as Record<ProfessionId, boolean>;
  const nextFlags: Record<string, boolean> = { ...(base.professionFlags ?? {}) };

  for (const id of PROFESSION_IDS) {
    const def = PROFESSION_REGISTRY[id];
    const stat = def.primaryStat;
    const statOk = statQualified(input.stats, stat, def.certification.primaryStatMin);

    // 行为证据：轻量、可验证、与玩法系统联动（威胁/移动/图鉴/关系/锻造/武器可靠性）
    const behaviorEvidenceTarget = def.certification.behaviorEvidenceTarget;
    const behaviorEvidenceKeys = computeBehaviorEvidenceKeys(id, input);
    const behaviorEvidenceCount = behaviorEvidenceKeys.length;
    const behaviorOk = behaviorEvidenceCount >= behaviorEvidenceTarget;
    const prev = progressByProfession[id] ?? {
      statQualified: false,
      behaviorQualified: false,
      behaviorEvidenceCount: 0,
      behaviorEvidenceTarget: 0,
      behaviorEvidenceKeys: [],
      trialTaskId: null,
      trialTaskCompleted: false,
      certified: false,
    };
    const trialTaskId = getProfessionTrialTaskId(id);
    const trialTaskCompleted = (input.tasks ?? []).some((t) => t.id === trialTaskId && t.status === "completed");

    // -----------------------------
    // Phase-2: 玩家可见进度层（5段闭环）
    // 倾向显露 → 被签发者看见 → 试炼授予/接受 → 正式认证 → 身份痕迹
    // -----------------------------
    const inclinationVisible =
      Boolean(prev.inclinationVisible) ||
      statOk ||
      behaviorEvidenceCount > 0 ||
      trialTaskCompleted ||
      Boolean(base.currentProfession);
    const observedByCertifier =
      Boolean(prev.observedByCertifier) ||
      codexHasNpc(input.codex, def.certification.certifierNpcId) ||
      Boolean(base.currentProfession);
    const trialRow = taskExists(input.tasks, trialTaskId);
    const trialOffered =
      Boolean(prev.trialOffered) ||
      (inclinationVisible && observedByCertifier) ||
      Boolean(trialRow) ||
      Boolean(base.currentProfession);
    // trialAccepted：一旦出现为 active / completed / failed，视为叙事已接下（可追责）。
    const trialAccepted =
      Boolean(prev.trialAccepted) ||
      (trialRow ? (trialRow.status === "active" || trialRow.status === "completed" || trialRow.status === "failed") : false) ||
      Boolean(base.currentProfession);
    const identityImprinted =
      Boolean(prev.identityImprinted) ||
      Boolean(base.professionFlags?.[getProfessionImprintFlag(id)]) ||
      Boolean(base.currentProfession === id);

    // 把阶段写成轻量 world flags，供 runtime packet / DM 约束直接消费（不破坏 SSE 结构）。
    if (inclinationVisible) nextFlags[`profession.inclination.${id}`] = true;
    if (observedByCertifier) nextFlags[`profession.observed.${id}`] = true;
    if (trialOffered) nextFlags[`profession.trial.offered.${id}`] = true;
    if (trialAccepted) nextFlags[`profession.trial.accepted.${id}`] = true;
    if (trialTaskCompleted) nextFlags[`profession.trial.completed.${id}`] = true;
    if (identityImprinted) nextFlags[`profession.imprinted.${id}`] = true;

    progressByProfession[id] = {
      ...prev,
      statQualified: statOk,
      behaviorQualified: behaviorOk,
      behaviorEvidenceCount,
      behaviorEvidenceTarget,
      behaviorEvidenceKeys,
      trialTaskId,
      trialTaskCompleted,
      inclinationVisible,
      observedByCertifier,
      trialOffered,
      trialAccepted,
      identityImprinted,
    };
    // 单职业制：如果已经有 currentProfession，则只保留“进度展示”，不再对其它职业开放认证资格。
    eligibilityByProfession[id] = !base.currentProfession && statOk && behaviorOk && trialTaskCompleted;
  }
  const unlocked = [...new Set(base.unlockedProfessions.filter((x) => PROFESSION_IDS.includes(x)))];
  const activePerks = base.currentProfession ? [PROFESSION_REGISTRY[base.currentProfession].passivePerkId] : [];
  return {
    ...base,
    unlockedProfessions: unlocked,
    progressByProfession,
    eligibilityByProfession,
    activePerks,
    professionFlags: nextFlags,
    professionCooldowns: { ...(base.professionCooldowns ?? {}) },
  };
}

export function certifyProfession(state: ProfessionStateV1, profession: ProfessionId): ProfessionStateV1 {
  const eligibility = state.eligibilityByProfession?.[profession] ?? false;
  if (!eligibility) return state;
  const unlocked = state.unlockedProfessions.includes(profession)
    ? state.unlockedProfessions
    : [...state.unlockedProfessions, profession];
  return {
    ...state,
    currentProfession: profession,
    unlockedProfessions: unlocked,
    progressByProfession: {
      ...state.progressByProfession,
      [profession]: {
        ...state.progressByProfession[profession],
        certified: true,
      },
    },
    activePerks: [PROFESSION_REGISTRY[profession].passivePerkId],
  };
}

