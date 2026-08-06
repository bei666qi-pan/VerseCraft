/**
 * 阶段6–7：生成后 NPC 一致性校验（认知事实层 + 叙事规则层 + 叙事节奏保险丝）。
 *
 * 校验分两轨运行：
 * - Tier 1（所有在场 NPC）：角色混淆、不在场对话、规范命名别名 —— 廉价字符串启发式，无 actorId 依赖。
 * - Tier 2（仅焦点 NPC）：复合叙事质量守卫、特权/揭示层级约束、玩家回声、叙事节奏 —— 需要 actorId 与 canonical。
 */

import type { NpcCanonicalIdentity } from "@/lib/registry/types";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";
import { enableEpistemicValidator, enableNpcConsistencyValidator, epistemicDebugLog } from "@/lib/epistemic/featureFlags";
import { enableNarrativeRhythmGateAny } from "@/lib/playRealtime/npcNarrativeRolloutFlags";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
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
import { applyPovPostGeneration } from "./povValidator";
import { applyGenderPronounPostGeneration } from "./genderPronounValidator";
import { applyCompositeNarrativeGuard } from "./compositeNarrativeGuard";
import { enableCompositeNarrativeGuard } from "./narrativeGuardFlags";
import { applyProtagonistDriftPostGeneration } from "./protagonistDriftValidator";
import { detectPersonaMixup, rewritePersonaMixupConservatively } from "./personaMixupValidator";
import { incrProtagonistDriftRewriteCount, incrWorldPostRewriteCount } from "@/lib/observability/versecraftRolloutMetrics";
import { applyPlayerEchoPostGenerationValidation } from "@/lib/playerEcho/validator";
import type { NpcFirstEncounterEchoPlan } from "@/lib/playerEcho/types";
import { validateCanonNames, rewriteNpcNameAliases } from "./canonNameValidator";

export type NpcConsistencyViolationType =
  | "offscreen_npc_dialogue"
  | "normal_npc_old_friend_tone"
  | "loop_truth_premature"
  | "gender_pronoun_mismatch"
  | "pov_drift"
  | "narrative_continuity"
  | "familiarity_overreach"
  | "no_reaction_to_boundary_crossing"
  | "protagonist_drift"
  | "persona_mixup"
  | "player_echo_normal_npc_overreach"
  | "player_echo_reveal_overreach"
  | "player_echo_canon_override"
  | "canon_name_alias";

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

const IDLE_RHYTHM_FIELDS: {
  personalityDriftCount: number;
  foreshadowLeakCount: number;
  taskModeMismatchCount: number;
  timeFeelMismatchCount: number;
  narrativeRhythmRewriteTriggered: boolean;
  narrativeRhythmFinalSafe: boolean;
  narrativeRhythmLogs?: string[];
  npcPersonalityPacketChars: number;
  npcKnowledgePacketChars: number;
  narrativeGovernanceFinalSafe: boolean;
  npcBeliefGraphPacketPresent: boolean;
  majorNpcDifferentiationScore: number | null;
  taskModeDistribution?: Record<string, number>;
  fineTimeCostUsage: number;
  personalityRewriteCount: number;
  avgFormalTaskDelayFromFirstContact: number | null;
} = {
  personalityDriftCount: 0,
  foreshadowLeakCount: 0,
  taskModeMismatchCount: 0,
  timeFeelMismatchCount: 0,
  narrativeRhythmRewriteTriggered: false,
  narrativeRhythmFinalSafe: true,
  npcPersonalityPacketChars: 0,
  npcKnowledgePacketChars: 0,
  narrativeGovernanceFinalSafe: true,
  npcBeliefGraphPacketPresent: false,
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
  playerEchoPacketPresent?: boolean;
  firstEncounterPlan?: NpcFirstEncounterEchoPlan | null;
}): { dmRecord: Record<string, unknown>; telemetry: EpistemicValidatorTelemetry } {
  // Phase6 rollout: allow fast rollback of post-generation rewrites.
  const rollout = getVerseCraftRolloutFlags();
  if (!rollout.enableWorldPostGenerationRewrite) {
    return { dmRecord: input.dmRecord, telemetry: IDLE_VALIDATOR_TELEMETRY };
  }
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

  const playerEchoValidatorEnabled = rollout.enablePlayerEchoValidator;

  // ── Tier 1: 关键认知检查（对所有在场 NPC 执行，不依赖焦点 NPC）──
  // 廉价字符串启发式，无大模型调用。优先运行以确保非焦点 NPC 的认知边界
  // 也被独立校验。
  const tier1Narrative = typeof rec.narrative === "string" ? rec.narrative : "";
  let tier1Work = tier1Narrative;
  const tier1Violations: string[] = [];
  const tier1Vtypes: string[] = [];
  const tier1Logs: string[] = [];
  let tier1Rewrite = false;

  if (enableNpcConsistencyValidator()) {
    // 阶段 10.5：多人 NPC 角色混淆检测器
    try {
      const mix = detectPersonaMixup({
        narrative: tier1Work,
        presentNpcIds: input.presentNpcIds,
        focusNpcId: input.actorNpcId?.trim() || null,
      });
      if (mix.hits.length > 0) {
        tier1Violations.push(...mix.hits.map((h) => `persona_mixup:${h.victimNpcId}<=${h.leakedFromNpcId}:${h.kind}:${h.token}`));
        if (!tier1Vtypes.includes("persona_mixup")) tier1Vtypes.push("persona_mixup");
        tier1Logs.push(`persona_mixup:${mix.hits.slice(0, 3).map((h) => `${h.victimNpcId}<=${h.leakedFromNpcId}:${h.token}`).join("|")}`);
        const rw = rewritePersonaMixupConservatively({ narrative: tier1Work, hits: mix.hits });
        if (rw.changed) {
          tier1Work = rw.narrative;
          tier1Rewrite = true;
        }
      }
    } catch (e) {
      console.warn("[npc_consistency] persona mixup detection skipped", e);
    }

    // 不在场 NPC 对话检测
    const off = findOffscreenNpcDialogueViolations(tier1Work, input.presentNpcIds);
    if (off.length) {
      tier1Violations.push(...off);
      tier1Vtypes.push("offscreen_npc_dialogue");
      tier1Logs.push(`offscreen:${off.join(",")}`);
      tier1Work = rewriteNarrativeOffscreenDialogue(tier1Work, input.presentNpcIds);
      tier1Rewrite = true;
    }
  }

  // 规范命名别名纠错：始终运行
  try {
    const canonWarnings = validateCanonNames(tier1Work, input.presentNpcIds);
    if (canonWarnings.length > 0) {
      const rw = rewriteNpcNameAliases(tier1Work, canonWarnings);
      if (rw.rewrites > 0 && rw.narrative !== tier1Work) {
        tier1Work = rw.narrative;
        tier1Rewrite = true;
        tier1Violations.push("canon_name_alias");
        if (!tier1Vtypes.includes("canon_name_alias")) tier1Vtypes.push("canon_name_alias");
        tier1Logs.push(`canon_name_alias:${rw.rewrites} rewrites`);
      }
    }
  } catch (e) {
    console.warn("[npc_consistency] canon name alias check skipped", e);
  }

  // ── Feature gate：若无更高级别功能启用且无 actor，则直接返回 ──
  if (!enableNpcConsistencyValidator() && !enableNarrativeRhythmGateAny() && !playerEchoValidatorEnabled) {
    if (tier1Rewrite) {
      rec.narrative = tier1Work;
      incrWorldPostRewriteCount(1);
    }
    if (tier1Violations.length > 0) {
      const prevMeta =
        rec.security_meta && typeof rec.security_meta === "object" && !Array.isArray(rec.security_meta)
          ? (rec.security_meta as Record<string, unknown>)
          : {};
      rec.security_meta = {
        ...prevMeta,
        npc_consistency_validator: {
          violations: tier1Violations,
          types: tier1Vtypes,
          logs: tier1Logs,
        },
      };
      epistemicDebugLog("npc_consistency_validator", { types: tier1Vtypes });
    }
    return {
      dmRecord: rec,
      telemetry: {
        ...baseTelemetry,
        validatorTriggered: baseTelemetry.validatorTriggered || tier1Violations.length > 0,
        rewriteTriggered: baseTelemetry.rewriteTriggered || tier1Rewrite,
        rewriteReason: tier1Rewrite && !baseTelemetry.rewriteTriggered ? "npc_consistency_layer" : baseTelemetry.rewriteReason,
        npcConsistencyValidatorTriggered: tier1Violations.length > 0,
        violationTypes: [
          ...new Set([
            ...(baseTelemetry.leakType !== "none" ? [baseTelemetry.leakType] : []),
            ...tier1Vtypes,
          ]),
        ],
        consistencyViolations: tier1Violations,
        validatorLogs: tier1Logs,
        finalResponseSafe: true,
      },
    };
  }

  const actorId = input.actorNpcId?.trim() || null;
  if (!actorId) {
    if (tier1Rewrite) {
      rec.narrative = tier1Work;
      incrWorldPostRewriteCount(1);
    }
    if (tier1Violations.length > 0) {
      const prevMeta =
        rec.security_meta && typeof rec.security_meta === "object" && !Array.isArray(rec.security_meta)
          ? (rec.security_meta as Record<string, unknown>)
          : {};
      rec.security_meta = {
        ...prevMeta,
        npc_consistency_validator: {
          violations: tier1Violations,
          types: tier1Vtypes,
          logs: tier1Logs,
        },
      };
      epistemicDebugLog("npc_consistency_validator", { types: tier1Vtypes });
    }
    return {
      dmRecord: rec,
      telemetry: {
        ...baseTelemetry,
        validatorTriggered: baseTelemetry.validatorTriggered || tier1Violations.length > 0,
        rewriteTriggered: baseTelemetry.rewriteTriggered || tier1Rewrite,
        rewriteReason: tier1Rewrite && !baseTelemetry.rewriteTriggered ? "npc_consistency_layer" : baseTelemetry.rewriteReason,
        npcConsistencyValidatorTriggered: tier1Violations.length > 0,
        violationTypes: [
          ...new Set([
            ...(baseTelemetry.leakType !== "none" ? [baseTelemetry.leakType] : []),
            ...tier1Vtypes,
          ]),
        ],
        consistencyViolations: tier1Violations,
        validatorLogs: tier1Logs,
        finalResponseSafe: true,
      },
    };
  }

  // ── Tier 2: 焦点 NPC 依赖的检查（复合守卫、特权校验、玩家回声、叙事节奏）──
  const canon = input.canonical ?? getNpcCanonicalIdentity(actorId);
  const priv = canon.memoryPrivilege;
  const privileged = priv === "xinlan" || priv === "major_charm" || priv === "night_reader";
  const mr = (input.maxRevealRank ?? 0) as RevealTierRank;

  let narrativeWork = tier1Work;

  const violations: string[] = [...tier1Violations];
  const vtypes: string[] = [...tier1Vtypes];
  const logs: string[] = [...tier1Logs];
  let extraRewrite = tier1Rewrite;
  let compositeTelemetry: {
    continuityValidatorTriggered: boolean;
    povValidatorTriggered: boolean;
    genderValidatorTriggered: boolean;
    rewriteTriggered: boolean;
    rewriteReason: string | null;
    finalNarrativeSafe: boolean;
    logs: string[];
  } | null = null;

  // 阶段10：统一叙事质量裁决层（continuity → POV → gender）
  if (enableCompositeNarrativeGuard()) {
    const c = applyCompositeNarrativeGuard({
      narrative: narrativeWork,
      latestUserInput: String(input.latestUserInput ?? ""),
      previousTailSummary: null,
      focusNpcId: actorId,
      presentNpcIds: input.presentNpcIds,
    });
    compositeTelemetry = c.telemetry;
    if (c.narrative !== narrativeWork) {
      narrativeWork = c.narrative;
      extraRewrite = true;
      if (c.telemetry.povValidatorTriggered && !vtypes.includes("pov_drift")) vtypes.push("pov_drift");
      if (c.telemetry.genderValidatorTriggered) {
        violations.push("gender_pronoun_mismatch");
        if (!vtypes.includes("gender_pronoun_mismatch")) vtypes.push("gender_pronoun_mismatch");
      }
      if (c.telemetry.continuityValidatorTriggered) {
        violations.push("narrative_continuity");
        if (!vtypes.includes("narrative_continuity")) vtypes.push("narrative_continuity");
      }
      logs.push(`composite:${c.telemetry.rewriteReason ?? "rewrite"}`);
      logs.push(...c.telemetry.logs.slice(0, 3));
    }
  } else {
    // 兼容：旧路径（逐项 guard）
    const pov = applyPovPostGeneration(narrativeWork);
    if (pov.triggered && pov.narrative !== narrativeWork) {
      narrativeWork = pov.narrative;
      extraRewrite = true;
      logs.push(`pov:${pov.severity}:${pov.debug.secondPersonHits}`);
      if (!vtypes.includes("pov_drift")) vtypes.push("pov_drift");
      violations.push("pov_second_person_narration");
    }
    const genderFix = applyGenderPronounPostGeneration({
      narrative: narrativeWork,
      focusNpcId: actorId,
      presentNpcIds: input.presentNpcIds,
    });
    if (genderFix.triggered && genderFix.narrative !== narrativeWork) {
      narrativeWork = genderFix.narrative;
      extraRewrite = true;
      violations.push("gender_pronoun_mismatch");
      if (!vtypes.includes("gender_pronoun_mismatch")) vtypes.push("gender_pronoun_mismatch");
      logs.push(`gender:${genderFix.severity}:${genderFix.logs.slice(0, 2).join("|")}`);
    }
  }

  // 阶段11：主角身份漂移门闸（无二次大模型，尽量保守改写保持沉浸）
  const drift = applyProtagonistDriftPostGeneration({
    narrative: narrativeWork,
    playerContext: input.playerContext ?? null,
  });
  if (drift.triggered && drift.narrative !== narrativeWork) {
    narrativeWork = drift.narrative;
    extraRewrite = true;
    incrProtagonistDriftRewriteCount(1);
    violations.push(...drift.reasons.map((r) => `protagonist_drift:${r}`));
    if (!vtypes.includes("protagonist_drift")) vtypes.push("protagonist_drift");
    logs.push(`protagonist_drift:${drift.reasons.slice(0, 2).join(",")}`);
  }

  if (enableNpcConsistencyValidator()) {
    // T1 已运行 persona mixup 与 offscreen dialogue，此处仅运行焦点 NPC 特权校验。

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

    // legacy 保守软化：保留，但优先级低于 canonical-based 局部纠错（阶段3）。
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

  // T1 已运行 canon name alias，此处不再重复。

  if (playerEchoValidatorEnabled) {
    const echo = applyPlayerEchoPostGenerationValidation({
      narrative: narrativeWork,
      actorNpcId: actorId,
      canonical: canon,
      maxRevealRank: mr,
      playerEchoPacketPresent: Boolean(input.playerEchoPacketPresent),
      firstEncounterPlan: input.firstEncounterPlan ?? null,
    });
    if (echo.telemetry.validatorTriggered) {
      violations.push(...echo.telemetry.violations);
      for (const vt of echo.telemetry.violationTypes) {
        if (!vtypes.includes(vt)) vtypes.push(vt);
      }
      logs.push(`player_echo:${echo.telemetry.source}:${echo.telemetry.violationTypes.join(",")}`);
    }
    if (echo.narrative !== narrativeWork) {
      narrativeWork = echo.narrative;
      extraRewrite = true;
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

  if (narrativeWork !== tier1Narrative) {
    rec.narrative = narrativeWork;
    // Any post-generation rewrite counts toward world-consistency rewrite budget/observability.
    incrWorldPostRewriteCount(1);
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
    continuityValidatorTriggered: compositeTelemetry?.continuityValidatorTriggered ?? false,
    povValidatorTriggered: compositeTelemetry?.povValidatorTriggered ?? false,
    genderValidatorTriggered: compositeTelemetry?.genderValidatorTriggered ?? false,
    narrativeGuardRewriteReason: compositeTelemetry?.rewriteReason ?? null,
    finalNarrativeSafe: compositeTelemetry?.finalNarrativeSafe ?? true,
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
      ...(compositeTelemetry
        ? {
            narrative_quality_guard: {
              version: 1,
              ...compositeTelemetry,
            },
          }
        : {}),
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
