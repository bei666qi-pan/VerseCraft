/**
 * 阶段7–8：人物一致性与揭露节奏 — 聚合校验 + 叙事保险丝（子开关可独立灰度）。
 */

import { rewriteNarrativeHeavyLeak, appendSoftHedge } from "@/lib/epistemic/rewrite";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";
import {
  buildActorConstraintBundle,
  parseRtTaskLayers,
} from "@/lib/playRealtime/actorConstraintPackets";
import {
  enableFineGrainTimeCost,
  enableForeshadowValidator,
  enableNpcPersonalityDebug,
  enablePersonalityValidator,
  enableTaskModeValidator,
  enableTimeFeelValidator,
  enableXinlanRevealSpecialCase,
} from "@/lib/playRealtime/npcNarrativeRolloutFlags";
import { guessPlayerLocationFromContext } from "@/lib/playRealtime/b1Safety";
import type { NpcCanonicalIdentity } from "@/lib/registry/types";
import type { RevealTierRank } from "@/lib/registry/revealTierRank";
import type { ActionTimeCostKind } from "@/lib/time/actionCost";
import type { TaskNarrativeLayerKind } from "@/lib/tasks/taskRoleModel";
import { validateForeshadowNarrative, type ForeshadowValidatorResult } from "./foreshadowValidator";
import type { PersonalityValidatorResult } from "./personalityValidator";
import { validatePersonalityNarrative } from "./personalityValidator";
import { validateTaskModeNarrative, type TaskModeValidatorResult } from "./taskModeValidator";
import { validateTimeFeelNarrative, type TimeFeelValidatorResult } from "./timeFeelValidator";
import { scrubTaskUiSurfacePhrases } from "./rewrite";

export type NarrativeRhythmTelemetry = {
  personalityDriftCount: number;
  foreshadowLeakCount: number;
  taskModeMismatchCount: number;
  timeFeelMismatchCount: number;
  narrativeRhythmRewriteTriggered: boolean;
  narrativeRhythmFinalSafe: boolean;
  narrativeRhythmLogs?: string[];
  npcPersonalityPacketChars?: number;
  /** 启发式：高魅力且无人格漂移≈高区分；有漂移压低 */
  majorNpcDifferentiationScore?: number | null;
  taskModeDistribution?: Record<string, number>;
  /** 1 表示本回合细粒度档位非 standard 且开关开启 */
  fineTimeCostUsage?: number;
  personalityRewriteCount?: number;
  /** 需客户端/存档统计，此处占位 null */
  avgFormalTaskDelayFromFirstContact?: number | null;
};

function parsePendingHourFraction(pc: string): number {
  const m = pc.match(/【小时余量】([0-9]+(?:\.[0-9]+)?)/);
  if (!m?.[1]) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function hotThreatFromContext(pc: string): boolean {
  const raw = pc.match(/主威胁状态：([^。]+)。/)?.[1] ?? "";
  return /\|(active|breached)\|/.test(raw);
}

function idlePersonality(): PersonalityValidatorResult {
  return {
    personalityDriftDetected: false,
    driftType: null,
    severity: "none",
    rewriteNeeded: false,
  };
}

const IDLE_FORESHADOW: ForeshadowValidatorResult = {
  leakDetected: false,
  leakType: null,
  severity: "none",
  rewriteNeeded: false,
};

const IDLE_TASK_MODE: TaskModeValidatorResult = {
  taskModeMismatchDetected: false,
  mismatchType: null,
  severity: "none",
  rewriteNeeded: false,
};

const IDLE_TIME_FEEL: TimeFeelValidatorResult = {
  timeFeelMismatchDetected: false,
  mismatchType: null,
  severity: "none",
  rewriteNeeded: false,
};

function distributionFromLayers(layers: Array<{ taskId: string; layer: TaskNarrativeLayerKind }>) {
  const c = { soft_lead: 0, conversation_promise: 0, formal_task: 0 };
  for (const x of layers) {
    if (x.layer === "soft_lead") c.soft_lead += 1;
    else if (x.layer === "conversation_promise") c.conversation_promise += 1;
    else c.formal_task += 1;
  }
  return c;
}

export function applyNarrativeRhythmGate(input: {
  narrative: string;
  focusNpcId: string;
  maxRevealRank: RevealTierRank;
  playerContext: string;
  latestUserInput: string;
  canonical: NpcCanonicalIdentity;
}): { narrative: string; telemetry: NarrativeRhythmTelemetry; violationTypes: string[] } {
  const original = String(input.narrative ?? "");
  let n = original;
  const logs: string[] = [];
  const vtypes: string[] = [];

  const bundle = buildActorConstraintBundle({
    playerContext: input.playerContext,
    latestUserInput: input.latestUserInput,
    focusNpcId: input.focusNpcId,
    location: guessPlayerLocationFromContext(input.playerContext) ?? "B1_SafeZone",
    maxRevealRank: input.maxRevealRank,
    hotThreatPresent: hotThreatFromContext(input.playerContext),
    activeTaskIds: parseRtTaskLayers(input.playerContext)
      .map((x) => x.taskId)
      .slice(0, 16),
    pendingHourFraction: parsePendingHourFraction(input.playerContext),
  });

  const personalityPkt = bundle.actor_personality_packet as Record<string, unknown>;
  const npcPersonalityPacketChars = JSON.stringify(bundle.actor_personality_packet).length;
  const baselineAttitude = typeof personalityPkt.attitude === "string" ? personalityPkt.attitude : null;
  const isXinlan =
    input.focusNpcId.trim() === XINLAN_NPC_ID || input.canonical.memoryPrivilege === "xinlan";
  const pktForPersonality =
    personalityPkt.npcId !== null && personalityPkt.npcId !== undefined ? personalityPkt : null;

  const layers = parseRtTaskLayers(input.playerContext);

  let p = idlePersonality();
  if (enablePersonalityValidator()) {
    p = validatePersonalityNarrative({
      narrative: n,
      actorPersonalityPacket: pktForPersonality,
      baselineAttitude,
      memoryPrivilege: input.canonical.memoryPrivilege,
    });
    if (p.personalityDriftDetected) {
      vtypes.push(`personality_drift:${p.driftType ?? "unknown"}`);
      logs.push(`personality:${p.driftType}`);
    }
  }

  let f: ForeshadowValidatorResult = IDLE_FORESHADOW;
  if (enableForeshadowValidator()) {
    f = validateForeshadowNarrative({
      narrative: n,
      focusNpcId: input.focusNpcId,
      maxRevealRank: input.maxRevealRank,
      isXinlan,
      xinlanRevealSpecialCase: enableXinlanRevealSpecialCase(),
    });
    if (f.leakDetected) {
      vtypes.push(`foreshadow_leak:${f.leakType ?? "unknown"}`);
      logs.push(`foreshadow:${f.leakType}`);
    }
  }

  let tm: TaskModeValidatorResult = IDLE_TASK_MODE;
  if (enableTaskModeValidator()) {
    tm = validateTaskModeNarrative({ narrative: n, taskLayers: layers });
    if (tm.taskModeMismatchDetected) {
      vtypes.push(`task_mode:${tm.mismatchType ?? "unknown"}`);
      logs.push(`task:${tm.mismatchType}`);
    }
  }

  const atc = bundle.action_time_cost_packet as Record<string, unknown>;
  const suggestRaw = atc.suggest_for_this_turn;
  const suggest = (typeof suggestRaw === "string" ? suggestRaw : null) as ActionTimeCostKind | null;
  const fineTimeCostUsage =
    enableFineGrainTimeCost() && suggest !== null && suggest !== "standard" ? 1 : 0;

  let tf: TimeFeelValidatorResult = IDLE_TIME_FEEL;
  if (enableTimeFeelValidator()) {
    tf = validateTimeFeelNarrative({ narrative: n, suggestForTurn: suggest });
    if (tf.timeFeelMismatchDetected) {
      vtypes.push(`time_feel:${tf.mismatchType ?? "unknown"}`);
      logs.push(`time:${tf.mismatchType}`);
    }
  }

  const anyHigh =
    p.severity === "high" || f.severity === "high" || tm.severity === "high";
  const anyLow =
    p.severity === "low" ||
    f.severity === "low" ||
    tm.severity === "low" ||
    tf.severity === "low";

  let rewritten = false;
  if (anyHigh) {
    n = rewriteNarrativeHeavyLeak(n, "world_truth_premature");
    rewritten = true;
  } else if (tm.taskModeMismatchDetected || tf.timeFeelMismatchDetected || anyLow) {
    if (tm.taskModeMismatchDetected) n = scrubTaskUiSurfacePhrases(n);
    if (tf.timeFeelMismatchDetected || anyLow) n = appendSoftHedge(n);
    rewritten = n !== original;
  }

  if (enableNpcPersonalityDebug() && vtypes.length > 0) {
    console.info("[npc-personality-rhythm]", { focusNpcId: input.focusNpcId, vtypes, logs });
  }

  const maj =
    input.canonical.memoryPrivilege === "major_charm" ||
    input.canonical.memoryPrivilege === "xinlan";
  const majorNpcDifferentiationScore = maj ? (p.personalityDriftDetected ? 0.35 : 0.92) : null;

  return {
    narrative: n,
    telemetry: {
      personalityDriftCount: enablePersonalityValidator() && p.personalityDriftDetected ? 1 : 0,
      foreshadowLeakCount: enableForeshadowValidator() && f.leakDetected ? 1 : 0,
      taskModeMismatchCount: enableTaskModeValidator() && tm.taskModeMismatchDetected ? 1 : 0,
      timeFeelMismatchCount: enableTimeFeelValidator() && tf.timeFeelMismatchDetected ? 1 : 0,
      narrativeRhythmRewriteTriggered: rewritten,
      narrativeRhythmFinalSafe: true,
      narrativeRhythmLogs: logs.length ? logs : undefined,
      npcPersonalityPacketChars,
      majorNpcDifferentiationScore,
      taskModeDistribution: distributionFromLayers(layers),
      fineTimeCostUsage,
      personalityRewriteCount:
        enablePersonalityValidator() && p.personalityDriftDetected && rewritten ? 1 : 0,
      avgFormalTaskDelayFromFirstContact: null,
    },
    violationTypes: vtypes,
  };
}
