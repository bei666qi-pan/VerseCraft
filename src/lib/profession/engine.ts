import type { SnapshotMainThreatState } from "@/lib/state/snapshot/types";
import type { ProfessionId, ProfessionProgress, ProfessionStateV1 } from "./types";
import { PROFESSION_IDS, PROFESSION_REGISTRY, createDefaultProfessionState } from "./registry";
import type { StatType, Weapon } from "@/lib/registry/types";

type TaskLite = { id: string; status: "active" | "completed" | "failed" | "hidden" | "available" };
type CodexLite = { type: "npc" | "anomaly" };

function safeNum(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function countCompletedTasks(tasks: TaskLite[]): number {
  return (tasks ?? []).filter((t) => t.status === "completed").length;
}

function countSuppressedThreats(map: Record<string, SnapshotMainThreatState>): number {
  return Object.values(map ?? {}).filter((x) => x.phase === "suppressed").length;
}

function countNpcCodexEntries(codex: Record<string, CodexLite>): number {
  return Object.values(codex ?? {}).filter((x) => x.type === "npc").length;
}

function statQualified(stats: Record<StatType, number>, stat: StatType): boolean {
  return safeNum(stats?.[stat]) >= 20;
}

function behaviorEvidenceByProfession(args: {
  id: ProfessionId;
  tasks: TaskLite[];
  historicalMaxFloorScore: number;
  mainThreatByFloor: Record<string, SnapshotMainThreatState>;
  codex: Record<string, CodexLite>;
  inventoryCount: number;
  warehouseCount: number;
  equippedWeapon: Weapon | null;
}): number {
  const completed = countCompletedTasks(args.tasks);
  if (args.id === "守灯人") {
    const a = countSuppressedThreats(args.mainThreatByFloor) >= 1 ? 1 : 0;
    const b = completed >= 3 ? 1 : 0;
    return a + b;
  }
  if (args.id === "巡迹客") {
    const a = safeNum(args.historicalMaxFloorScore) >= 3 ? 1 : 0;
    const b = safeNum(args.historicalMaxFloorScore) >= 5 ? 1 : 0;
    return a + b;
  }
  if (args.id === "觅兆者") {
    const a = (safeNum(args.inventoryCount) + safeNum(args.warehouseCount)) >= 6 ? 1 : 0;
    const b = Object.values(args.mainThreatByFloor ?? {}).some((x) => (x.counterHintsUsed ?? []).length > 0) ? 1 : 0;
    return a + b;
  }
  if (args.id === "齐日角") {
    const a = countNpcCodexEntries(args.codex) >= 3 ? 1 : 0;
    const b = completed >= 2 ? 1 : 0;
    return a + b;
  }
  const a = Boolean(args.equippedWeapon && ((args.equippedWeapon.currentMods ?? []).length > 0 || (args.equippedWeapon.currentInfusions ?? []).length > 0)) ? 1 : 0;
  const b = countNpcCodexEntries(args.codex) >= 2 ? 1 : 0;
  return a + b;
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
  for (const id of PROFESSION_IDS) {
    const stat = PROFESSION_REGISTRY[id].primaryStat;
    const statOk = statQualified(input.stats, stat);
    const behaviorEvidenceCount = behaviorEvidenceByProfession({
      id,
      tasks: input.tasks,
      historicalMaxFloorScore: input.historicalMaxFloorScore,
      mainThreatByFloor: input.mainThreatByFloor,
      codex: input.codex,
      inventoryCount: input.inventoryCount,
      warehouseCount: input.warehouseCount,
      equippedWeapon: input.equippedWeapon,
    });
    const behaviorEvidenceTarget = 2;
    const behaviorOk = behaviorEvidenceCount >= behaviorEvidenceTarget;
    const prev = progressByProfession[id] ?? {
      statQualified: false,
      behaviorQualified: false,
      behaviorEvidenceCount: 0,
      behaviorEvidenceTarget: 2,
      trialTaskId: null,
      trialTaskCompleted: false,
      certified: false,
    };
    const trialTaskId = prev.trialTaskId ?? null;
    const trialTaskCompleted = Boolean(
      trialTaskId &&
      input.tasks.some((t) => t.id === trialTaskId && t.status === "completed")
    );
    progressByProfession[id] = {
      ...prev,
      statQualified: statOk,
      behaviorQualified: behaviorOk,
      behaviorEvidenceCount,
      behaviorEvidenceTarget,
      trialTaskId,
      trialTaskCompleted,
    };
    eligibilityByProfession[id] = statOk && behaviorOk && trialTaskCompleted;
  }
  const unlocked = [...new Set(base.unlockedProfessions.filter((x) => PROFESSION_IDS.includes(x)))];
  const activePerks = base.currentProfession ? [PROFESSION_REGISTRY[base.currentProfession].passivePerkId] : [];
  return {
    ...base,
    unlockedProfessions: unlocked,
    progressByProfession,
    eligibilityByProfession,
    activePerks,
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

