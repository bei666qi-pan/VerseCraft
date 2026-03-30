/**
 * 阶段6–7：生成后 NPC 一致性校验（认知事实层 + 叙事规则层 + 叙事节奏保险丝）。
 */

import type { NpcCanonicalIdentity } from "@/lib/registry/types";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";
import { enableEpistemicValidator, enableNpcConsistencyValidator, epistemicDebugLog } from "@/lib/epistemic/featureFlags";
import { enableNarrativeRhythmGateAny } from "@/lib/playRealtime/npcNarrativeRolloutFlags";
import {
  applyEpistemicPostGenerationValidation,
  type EpistemicValidatorTelemetry,
} from "@/lib/epistemic/validator";
import type { EpistemicAnomalyResult, KnowledgeFact, NpcEpistemicProfile } from "@/lib/epistemic/types";
import {
  rewriteNarrativeLoopTruthLeak,
  rewriteNarrativeOffscreenDialogue,
  rewriteNarrativeOldFriendLeak,
  softenNarrativeWithHedge,
} from "./rewrite";
import { applyNarrativeRhythmGate } from "./narrativeRhythmGate";

export type NpcConsistencyViolationType =
  | "offscreen_npc_dialogue"
  | "normal_npc_old_friend_tone"
  | "loop_truth_premature"
  | "gender_pronoun_mismatch"
  | "familiarity_overreach"
  | "no_reaction_to_boundary_crossing";

function normalizeNpcId(id: string): string {
  return String(id ?? "")
    .trim()
    .replace(/^n-(\d{3})$/i, "N-$1")
    .toUpperCase();
}

/** 叙事里出现「N-xxx 说/道」但不在场集合 → 越权开口 */
export function findOffscreenNpcDialogueViolations(narrative: string, presentNpcIds: string[]): string[] {
  const present = new Set(presentNpcIds.map(normalizeNpcId).filter(Boolean));
  const violations: string[] = [];
  const re = /\b(N-\d{3})\b[^。]{0,48}(?:说|道|笑问|低声|抬头)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(narrative)) !== null) {
    const id = normalizeNpcId(m[1] ?? "");
    if (id && !present.has(id)) violations.push(`offscreen_line:${id}`);
  }
  return violations;
}

/** 保守：第三人称「她/他道」与 canonical 性别明显相反且同段无另一代词 */
export function narrativeHasLikelyGenderMismatch(narrative: string, canon: NpcCanonicalIdentity): boolean {
  if (canon.canonicalGender !== "male" && canon.canonicalGender !== "female") return false;
  const slice = narrative.slice(0, Math.min(narrative.length, 600));
  if (canon.canonicalGender === "male") {
    const sheSays = /(?:^|。|！|？|……)她(?:低声|轻声)?(?:道|说)/.test(slice);
    const heSays = /(?:^|。|！|？|……)他(?:低声|轻声)?(?:道|说)/.test(slice);
    return sheSays && !heSays;
  }
  const heSays = /(?:^|。|！|？|……)他(?:低声|轻声)?(?:道|说)/.test(slice);
  const sheSays = /(?:^|。|！|？|……)她(?:低声|轻声)?(?:道|说)/.test(slice);
  return heSays && !sheSays;
}

const OLD_FRIEND_RE = /老相识|老朋友|又见面了|咱俩|当年一起|还记得我吗|旧友|老队友/;
const LOOP_TRUTH_RE = /七锚.*闭环|循环.*真相|读档.*世界|校源.*根因|纠错链.*全貌/;
const OMN_RE = /七锚|全员真相|闭环已经|根因就是/;

const IDLE_VALIDATOR_TELEMETRY: EpistemicValidatorTelemetry = {
  validatorTriggered: false,
  leakType: "none",
  rewriteTriggered: false,
  rewriteReason: null,
  finalResponseSafe: true,
  involvedFields: [],
};

const IDLE_RHYTHM_FIELDS: Pick<
  EpistemicValidatorTelemetry,
  | "personalityDriftCount"
  | "foreshadowLeakCount"
  | "taskModeMismatchCount"
  | "timeFeelMismatchCount"
  | "narrativeRhythmRewriteTriggered"
  | "narrativeRhythmFinalSafe"
  | "npcPersonalityPacketChars"
  | "majorNpcDifferentiationScore"
  | "taskModeDistribution"
  | "fineTimeCostUsage"
  | "personalityRewriteCount"
  | "avgFormalTaskDelayFromFirstContact"
> = {
  personalityDriftCount: 0,
  foreshadowLeakCount: 0,
  taskModeMismatchCount: 0,
  timeFeelMismatchCount: 0,
  narrativeRhythmRewriteTriggered: false,
  narrativeRhythmFinalSafe: true,
  npcPersonalityPacketChars: 0,
  majorNpcDifferentiationScore: null,
  taskModeDistribution: undefined,
  fineTimeCostUsage: 0,
  personalityRewriteCount: 0,
  avgFormalTaskDelayFromFirstContact: null,
};

export function applyNpcConsistencyPostGeneration(input: {
  dmRecord: Record<string, unknown>;
  actorNpcId: string | null;
  presentNpcIds: string[];
  allFacts: KnowledgeFact[];
  profile: NpcEpistemicProfile | null;
  anomalyResult: EpistemicAnomalyResult | null;
  nowIso?: string;
  maxRevealRank?: number;
  canonical?: NpcCanonicalIdentity | null;
  /** 阶段7：与 actorConstraintPackets 同源，缺省时跳过叙事节奏门闸 */
  playerContext?: string | null;
  latestUserInput?: string | null;
}): { dmRecord: Record<string, unknown>; telemetry: EpistemicValidatorTelemetry } {
  let baseTelemetry: EpistemicValidatorTelemetry = IDLE_VALIDATOR_TELEMETRY;
  let rec = { ...input.dmRecord };

  if (enableEpistemicValidator()) {
    const ep = applyEpistemicPostGenerationValidation({
      dmRecord: input.dmRecord,
      actorNpcId: input.actorNpcId,
      presentNpcIds: input.presentNpcIds,
      allFacts: input.allFacts,
      profile: input.profile,
      anomalyResult: input.anomalyResult,
      nowIso: input.nowIso,
    });
    rec = { ...ep.dmRecord };
    baseTelemetry = ep.telemetry;
  }

  if (!enableNpcConsistencyValidator() && !enableNarrativeRhythmGateAny()) {
    return { dmRecord: rec, telemetry: baseTelemetry };
  }

  const actorId = input.actorNpcId?.trim() || null;
  if (!actorId) {
    return { dmRecord: rec, telemetry: baseTelemetry };
  }

  const canon = input.canonical ?? getNpcCanonicalIdentity(actorId);
  const priv = canon.memoryPrivilege;
  const privileged = priv === "xinlan" || priv === "major_charm" || priv === "night_reader";
  const mr = (input.maxRevealRank ?? 0) as RevealTierRank;

  const originalNarrative = typeof rec.narrative === "string" ? rec.narrative : "";
  let narrativeWork = originalNarrative;

  const violations: string[] = [];
  const vtypes: string[] = [];
  const logs: string[] = [];
  let extraRewrite = false;

  if (enableNpcConsistencyValidator()) {
    const off = findOffscreenNpcDialogueViolations(narrativeWork, input.presentNpcIds);
    if (off.length) {
      violations.push(...off);
      vtypes.push("offscreen_npc_dialogue");
      logs.push(`offscreen:${off.join(",")}`);
      narrativeWork = rewriteNarrativeOffscreenDialogue(narrativeWork);
      extraRewrite = true;
    }

    if (!privileged && OLD_FRIEND_RE.test(narrativeWork)) {
      violations.push("narrative_old_friend_tone");
      vtypes.push("normal_npc_old_friend_tone");
      narrativeWork = rewriteNarrativeOldFriendLeak(narrativeWork);
      extraRewrite = true;
      logs.push("old_friend_tone");
    }

    if (mr < REVEAL_TIER_RANK.deep && priv === "normal" && LOOP_TRUTH_RE.test(narrativeWork)) {
      violations.push("loop_truth_premature");
      vtypes.push("loop_truth_premature");
      narrativeWork = rewriteNarrativeLoopTruthLeak(narrativeWork);
      extraRewrite = true;
      logs.push("loop_truth");
    }

    if (narrativeHasLikelyGenderMismatch(narrativeWork, canon)) {
      violations.push("gender_pronoun_mismatch");
      vtypes.push("gender_pronoun_mismatch");
      narrativeWork = softenNarrativeWithHedge(narrativeWork);
      extraRewrite = true;
      logs.push("gender_soften");
    }

    if (priv === "major_charm" && OMN_RE.test(narrativeWork) && mr < REVEAL_TIER_RANK.abyss) {
      violations.push("familiarity_overreach");
      vtypes.push("familiarity_overreach");
      narrativeWork = rewriteNarrativeLoopTruthLeak(narrativeWork);
      extraRewrite = true;
      logs.push("major_charm_omn");
    }
  }

  let rhythmFields = { ...IDLE_RHYTHM_FIELDS };
  const pc = (input.playerContext ?? "").trim();
  if (enableNarrativeRhythmGateAny() && pc.length > 0) {
    const rhythm = applyNarrativeRhythmGate({
      narrative: narrativeWork,
      focusNpcId: actorId,
      maxRevealRank: mr,
      playerContext: pc,
      latestUserInput: String(input.latestUserInput ?? ""),
      canonical: canon,
    });
    rhythmFields = {
      ...IDLE_RHYTHM_FIELDS,
      ...rhythm.telemetry,
      narrativeRhythmLogs: rhythm.telemetry.narrativeRhythmLogs,
    };
    if (rhythm.narrative !== narrativeWork) {
      narrativeWork = rhythm.narrative;
      if (rhythm.telemetry.narrativeRhythmRewriteTriggered) {
        extraRewrite = true;
      }
    }
    for (const vt of rhythm.violationTypes) {
      violations.push(vt);
      if (!vtypes.includes(vt)) vtypes.push(vt);
    }
    if (rhythm.violationTypes.length) {
      logs.push(`narrative_rhythm:${rhythm.violationTypes.join(",")}`);
    }
  }

  if (narrativeWork !== originalNarrative) {
    rec.narrative = narrativeWork;
  }

  const layerHit = violations.length > 0;
  const rhythmViolationHit =
    rhythmFields.personalityDriftCount > 0 ||
    rhythmFields.foreshadowLeakCount > 0 ||
    rhythmFields.taskModeMismatchCount > 0 ||
    rhythmFields.timeFeelMismatchCount > 0;

  const telemetry: EpistemicValidatorTelemetry = {
    ...baseTelemetry,
    validatorTriggered: baseTelemetry.validatorTriggered || layerHit,
    rewriteTriggered: baseTelemetry.rewriteTriggered || extraRewrite,
    rewriteReason:
      extraRewrite && !baseTelemetry.rewriteTriggered
        ? rhythmFields.narrativeRhythmRewriteTriggered
          ? "narrative_rhythm_gate"
          : "npc_consistency_layer"
        : baseTelemetry.rewriteReason,
    npcConsistencyValidatorTriggered: layerHit,
    violationTypes: [
      ...new Set([
        ...(baseTelemetry.leakType !== "none" ? [baseTelemetry.leakType] : []),
        ...vtypes,
      ]),
    ],
    consistencyViolations: violations,
    validatorLogs: logs,
    finalResponseSafe: true,
    ...rhythmFields,
  };

  if (layerHit) {
    const prevMeta =
      rec.security_meta && typeof rec.security_meta === "object" && !Array.isArray(rec.security_meta)
        ? (rec.security_meta as Record<string, unknown>)
        : {};
    rec.security_meta = {
      ...prevMeta,
      npc_consistency_validator: {
        violations,
        types: vtypes,
        logs,
      },
      ...(rhythmViolationHit || rhythmFields.narrativeRhythmRewriteTriggered
        ? { narrative_rhythm_validator: rhythmFields }
        : {}),
    };
    epistemicDebugLog("npc_consistency_validator", {
      actorNpcId: actorId,
      types: vtypes,
    });
  }

  return { dmRecord: rec, telemetry };
}
