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
  // 单职业认证门槛：任一维度 > 20；职业本身按其 primaryStat 是否 > 20 来决定可选列表。
  return safeNum(stats?.[stat]) > 20;
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
    // V2：职业认证从“行为证据+试炼任务”简化为“primaryStat > 20 的职业可被选择”。
    // “遇到认证NPC/好感”等触发条件属于剧情/位置层信号，放在交互层处理，不在这里引入世界观耦合。
    const behaviorEvidenceTarget = 0;
    const behaviorEvidenceCount = 0;
    const behaviorOk = true;
    const prev = progressByProfession[id] ?? {
      statQualified: false,
      behaviorQualified: false,
      behaviorEvidenceCount: 0,
      behaviorEvidenceTarget: 0,
      trialTaskId: null,
      trialTaskCompleted: false,
      certified: false,
    };
    const trialTaskId = null;
    const trialTaskCompleted = true;
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

