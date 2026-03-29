/**
 * 阶段6：生成后 NPC 一致性校验（双保险：先 epistemic 事实层，再叙事规则层）。
 */

import type { NpcCanonicalIdentity } from "@/lib/registry/types";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { enableEpistemicValidator, enableNpcConsistencyValidator, epistemicDebugLog } from "@/lib/epistemic/featureFlags";
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

  if (!enableNpcConsistencyValidator()) {
    return { dmRecord: rec, telemetry: baseTelemetry };
  }

  const actorId = input.actorNpcId?.trim() || null;
  if (!actorId) {
    return { dmRecord: rec, telemetry: baseTelemetry };
  }

  const canon = input.canonical ?? getNpcCanonicalIdentity(actorId);
  const priv = canon.memoryPrivilege;
  const privileged = priv === "xinlan" || priv === "major_charm" || priv === "night_reader";
  const mr = input.maxRevealRank ?? 0;

  const originalNarrative = typeof rec.narrative === "string" ? rec.narrative : "";
  let narrativeWork = originalNarrative;

  const violations: string[] = [];
  const vtypes: string[] = [];
  const logs: string[] = [];
  let extraRewrite = false;

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

  if (narrativeWork !== originalNarrative) {
    rec.narrative = narrativeWork;
  }

  const npcLayerHit = violations.length > 0;
  const telemetry: EpistemicValidatorTelemetry = {
    ...baseTelemetry,
    validatorTriggered: baseTelemetry.validatorTriggered || npcLayerHit,
    rewriteTriggered: baseTelemetry.rewriteTriggered || extraRewrite,
    rewriteReason:
      extraRewrite && !baseTelemetry.rewriteTriggered ? "npc_consistency_layer" : baseTelemetry.rewriteReason,
    npcConsistencyValidatorTriggered: npcLayerHit,
    violationTypes: [
      ...new Set([
        ...(baseTelemetry.leakType !== "none" ? [baseTelemetry.leakType] : []),
        ...vtypes,
      ]),
    ],
    consistencyViolations: violations,
    validatorLogs: logs,
    finalResponseSafe: true,
  };

  if (npcLayerHit) {
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
    };
    epistemicDebugLog("npc_consistency_validator", {
      actorNpcId: actorId,
      types: vtypes,
    });
  }

  return { dmRecord: rec, telemetry };
}
