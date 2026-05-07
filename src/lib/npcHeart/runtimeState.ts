import type { CanonEvidenceRefV1, CanonTruthClass } from "@/lib/worldKnowledge/canon/types";
import type { NpcHeartRuntimeView } from "./types";

export interface NpcRuntimeStateV1 {
  npcId: string;
  displayName?: string;
  staticPersona: {
    archetype?: string;
    publicRole?: string;
    personalityTraits: string[];
    speechStyle: string[];
    surfaceMask?: string;
    deepContradiction?: string;
  };
  mood: {
    label: string;
    stress: number;
    volatility?: number;
    recentEmotionalCause?: string;
  };
  relationToPlayer: {
    trust?: number;
    familiarity?: number;
    tension?: number;
    debt?: number;
    suspicion?: number;
    label?: string;
  };
  activeGoal?: {
    goalId?: string;
    publicText?: string;
    privateText?: string;
    urgency?: number;
    source?: "profile" | "task" | "scene" | "memory" | "director";
  };
  hiddenGoal?: {
    text: string;
    revealMinRank: number;
    evidenceRefs?: CanonEvidenceRefV1[];
  };
  taboo: string[];
  refusalRules: string[];
  knowledgeBoundary: {
    maxRevealRank: number;
    allowedTruthClasses: CanonTruthClass[];
    forbiddenTags: string[];
    allowedFactIds?: string[];
    blockedFactIds?: string[];
    epistemicNote?: string;
  };
  speechAnchors: {
    mustSoundLike: string[];
    mustAvoid: string[];
    verbalTicks?: string[];
    metaphorField?: string[];
  };
  taskPressure?: {
    taskIds: string[];
    urgency?: number;
    risk?: string;
    residue?: string;
    relationFirstInstruction: string;
  };
  memoryHints?: {
    recent: string[];
    longTerm: string[];
    relationSpecific: string[];
  };
}

type NpcRuntimeTaskPressureV1 = NonNullable<NpcRuntimeStateV1["taskPressure"]>;
type NpcRuntimeMemoryHintsV1 = NonNullable<NpcRuntimeStateV1["memoryHints"]>;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function compactText(value: unknown, max = 90): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : text.slice(0, Math.max(0, max - 1));
}

function allowedTruthClasses(maxRevealRank: number): CanonTruthClass[] {
  const base: CanonTruthClass[] = ["observable", "rumor", "verified", "player_known"];
  if (maxRevealRank >= 2) base.push("hidden");
  return base;
}

function relationLabel(trust: number, fear: number): string {
  if (fear >= 55) return "high_tension";
  if (trust >= 45) return "trusted";
  if (trust <= 10) return "guarded";
  return "uncertain";
}

export function buildNpcRuntimeStateV1(args: {
  view: NpcHeartRuntimeView;
  maxRevealRank?: number;
  taskPressure?: Partial<NpcRuntimeTaskPressureV1> | null;
  memoryHints?: Partial<NpcRuntimeMemoryHintsV1> | null;
  hiddenGoalEvidenceRefs?: CanonEvidenceRefV1[];
}): NpcRuntimeStateV1 {
  const view = args.view;
  const profile = view.profile;
  const relation = view.relation;
  const maxRevealRank = clampNumber(args.maxRevealRank, 0, 3, 0);
  const fear = clampNumber(relation.fear, -100, 100, 0);
  const trust = clampNumber(relation.trust, -100, 100, 0);
  const stress = Math.max(
    0,
    Math.min(100, fear + (view.context.hotThreatPresent ? 25 : 0) + (view.context.activeTaskIds.length > 0 ? 8 : 0))
  );
  const taskIds = args.taskPressure?.taskIds?.length ? args.taskPressure.taskIds : view.context.activeTaskIds;

  return {
    npcId: profile.npcId,
    displayName: profile.displayName,
    staticPersona: {
      archetype: profile.charmTier,
      publicRole: profile.surfaceMask,
      personalityTraits: [
        compactText(profile.coreDrive, 72),
        compactText(profile.coreFear, 72),
        compactText(profile.softSpot, 72),
      ].filter(Boolean),
      speechStyle: [
        compactText(profile.speechContract, 120),
        compactText(view.behavioralHints.compactBehaviorLine, 90),
      ].filter(Boolean),
      surfaceMask: compactText(profile.surfaceMask, 120),
      deepContradiction: compactText(profile.personalityCore.contradictionSignature, 100),
    },
    mood: {
      label: view.attitudeLabel,
      stress,
      volatility: view.context.hotThreatPresent ? 60 : Math.max(10, Math.min(50, Math.abs(fear - trust))),
      recentEmotionalCause: view.context.hotThreatPresent ? "scene_threat" : undefined,
    },
    relationToPlayer: {
      trust,
      familiarity: clampNumber(relation.favorability, -100, 100, 0),
      tension: fear,
      debt: clampNumber(relation.debt, 0, 999, 0),
      suspicion: Math.max(0, fear - Math.max(0, trust)),
      label: relationLabel(trust, fear),
    },
    activeGoal: {
      publicText: compactText(view.whatNpcWantsFromPlayerNow, 120),
      urgency: taskIds.length > 0 ? Math.min(100, 35 + taskIds.length * 12 + stress) : Math.max(10, stress),
      source: taskIds.length > 0 ? "task" : "profile",
    },
    hiddenGoal: {
      text: compactText(profile.whatNpcWillNeverAskOpenly, 140),
      revealMinRank: Math.max(2, maxRevealRank),
      evidenceRefs: args.hiddenGoalEvidenceRefs,
    },
    taboo: [compactText(profile.tabooBoundary, 120)].filter(Boolean),
    refusalRules: [
      "Do not state dm_only facts as NPC knowledge.",
      "Do not reveal identity layers above knowledgeBoundary.maxRevealRank.",
      compactText(view.behavioralHints.forbiddenCaricature, 100),
    ].filter(Boolean),
    knowledgeBoundary: {
      maxRevealRank,
      allowedTruthClasses: allowedTruthClasses(maxRevealRank),
      forbiddenTags: ["dm_only", "system_only", maxRevealRank < 2 ? "reveal_deep" : "", maxRevealRank < 1 ? "reveal_fracture" : ""].filter(Boolean),
      epistemicNote: "NPC expression must follow actor-scoped knowledge, not global DM truth.",
    },
    speechAnchors: {
      mustSoundLike: [
        compactText(view.behavioralHints.speakThisRound, 100),
        compactText(view.behavioralHints.pushPullThisRound, 90),
      ].filter(Boolean),
      mustAvoid: [
        compactText(view.behavioralHints.forbiddenCaricature, 100),
        "generic task-giver voice",
      ],
      verbalTicks: [compactText(profile.personalityCore.recurringGesture, 48)].filter(Boolean),
      metaphorField: [compactText(profile.personalityCore.memoryResidueFlavor, 48)].filter(Boolean),
    },
    ...(taskIds.length > 0
      ? {
          taskPressure: {
            taskIds: taskIds.slice(0, 12),
            urgency: args.taskPressure?.urgency ?? Math.min(100, 40 + taskIds.length * 10 + Math.floor(stress / 2)),
            risk: args.taskPressure?.risk,
            residue: args.taskPressure?.residue,
            relationFirstInstruction:
              args.taskPressure?.relationFirstInstruction ??
              "Express relation and motive first; task pressure is a consequence, not the character voice.",
          },
        }
      : {}),
    memoryHints: {
      recent: (args.memoryHints?.recent ?? []).slice(0, 4),
      longTerm: (args.memoryHints?.longTerm ?? []).slice(0, 4),
      relationSpecific: (args.memoryHints?.relationSpecific ?? []).slice(0, 4),
    },
  };
}

export function renderNpcRuntimeStatePromptBlock(args: {
  states: NpcRuntimeStateV1[];
  maxChars?: number;
}): string {
  const states = args.states.slice(0, 5);
  if (states.length === 0) return "";
  const maxChars = Math.max(160, Math.min(900, args.maxChars ?? 560));
  const lines = ["## npc_runtime_state_v1"];
  for (const state of states) {
    lines.push(
      `- ${state.npcId}(${state.displayName ?? state.npcId}) mood=${state.mood.label}/stress:${state.mood.stress} relation=${state.relationToPlayer.label ?? "unknown"} reveal<=${state.knowledgeBoundary.maxRevealRank}`
    );
    lines.push(`  persona=${state.staticPersona.personalityTraits.join(" | ").slice(0, 150)}`);
    lines.push(`  speech=${state.speechAnchors.mustSoundLike.join(" | ").slice(0, 140)}`);
    if (state.taskPressure) {
      lines.push(`  task_pressure=${state.taskPressure.taskIds.join(",").slice(0, 120)}; ${state.taskPressure.relationFirstInstruction}`);
    }
    lines.push(`  avoid=${[...state.refusalRules, ...state.speechAnchors.mustAvoid].join(" | ").slice(0, 150)}`);
  }
  const text = lines.join("\n");
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

export function buildNpcRuntimeStatePacket(states: NpcRuntimeStateV1[]) {
  return {
    schema: "npc_runtime_state_v1",
    states: states.slice(0, 4).map((state) => ({
      npcId: state.npcId,
      displayName: state.displayName,
      mood: state.mood,
      relationToPlayer: state.relationToPlayer,
      activeGoal: state.activeGoal,
      knowledgeBoundary: state.knowledgeBoundary,
      speechAnchors: {
        mustSoundLike: state.speechAnchors.mustSoundLike.slice(0, 2),
        mustAvoid: state.speechAnchors.mustAvoid.slice(0, 2),
      },
      taskPressure: state.taskPressure,
    })),
  };
}
