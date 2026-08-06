/**
 * 生成后认知泄露校验（规则为主，无二次大模型）。
 */

import { enableEpistemicValidator, epistemicDebugLog } from "./featureFlags";
import { inputMentionsFactContent } from "./detector";
import { filterFactsForActor, forbiddenFactsForActor } from "./guards";
import {
  appendSoftHedge,
  rewriteNarrativeHeavyLeak,
  scrubDmStructuredFields,
  scrubTextWithForbiddenFacts,
} from "./rewrite";
import type { EpistemicAnomalyResult, EpistemicSceneContext, KnowledgeFact, NpcEpistemicProfile } from "./types";

export type EpistemicLeakType =
  | "none"
  | "private_fact_leak"
  | "world_truth_premature"
  | "overreach_acceptance"
  | "overconfident_confirmation";

export type EpistemicValidatorTelemetry = {
  validatorTriggered: boolean;
  leakType: EpistemicLeakType;
  rewriteTriggered: boolean;
  rewriteReason: string | null;
  finalResponseSafe: boolean;
  involvedFields: string[];
  /** 阶段6：NPC 一致性层（叙事规则） */
  npcConsistencyValidatorTriggered?: boolean;
  violationTypes?: string[];
  consistencyViolations?: string[];
  validatorLogs?: string[];
  /** 阶段7：人格/伏笔/任务层/时间感叙事保险丝 */
  personalityDriftCount?: number;
  foreshadowLeakCount?: number;
  taskModeMismatchCount?: number;
  timeFeelMismatchCount?: number;
  narrativeRhythmRewriteTriggered?: boolean;
  narrativeRhythmFinalSafe?: boolean;
  narrativeRhythmLogs?: string[];
  npcPersonalityPacketChars?: number;
  npcKnowledgePacketChars?: number;
  narrativeGovernanceFinalSafe?: boolean;
  npcBeliefGraphPacketPresent?: boolean;
  majorNpcDifferentiationScore?: number | null;
  taskModeDistribution?: Record<string, number>;
  fineTimeCostUsage?: number;
  personalityRewriteCount?: number;
  avgFormalTaskDelayFromFirstContact?: number | null;
  /** 阶段10：统一叙事质量裁决层（连续性/POV/性别代词） */
  continuityValidatorTriggered?: boolean;
  povValidatorTriggered?: boolean;
  genderValidatorTriggered?: boolean;
  narrativeGuardRewriteReason?: string | null;
  finalNarrativeSafe?: boolean;
};

const CONFIRM_RE = /(?:没错|正是如此|我早知道|确实如此|你说得对|是对的|确实是的|就是这样|的确如此)/;

function classifyForbiddenFact(f: KnowledgeFact): EpistemicLeakType {
  if (f.scope === "player" || f.scope === "npc") return "private_fact_leak";
  if (f.scope === "world" || f.sourceType === "system_canon") return "world_truth_premature";
  return "private_fact_leak";
}

/**
 * 欣蓝例外：仅豁免其明确被授权可知的世界/系统正史事实。
 * 未标记 xinlan_known 的 world/system_canon 事实仍进入 forbidden 列表并触发后验检测，
 * 避免欣蓝因过度豁免而实际泄露了她不应知晓的世界真相。
 *
 * 风险：当前代码库缺少统一的 xinlan_known 事实标记机制。在事实补齐标记之前，
 * 欣蓝对所有未标记的 world/system_canon 事实将按普通 NPC 规则处理（即全部拦截）。
 * TODO: 在 KnowledgeFact.tags 中统一写入 ["xinlan_known"]，或引入事实白名单表
 * （如 src/config/xinlanPermittedFacts.ts），由构建阶段（builders/policy）在生成
 * NpcEpistemicProfile 时注入允许的 factId 集合，供此处分发过滤。
 */
function forbiddenListForActor(
  allFacts: KnowledgeFact[],
  actorNpcId: string,
  scene: EpistemicSceneContext,
  profile: NpcEpistemicProfile | null,
  nowIso: string
): KnowledgeFact[] {
  const raw = forbiddenFactsForActor(allFacts, actorNpcId, scene, { nowIso });
  if (!profile?.isXinlanException) return raw;
  return raw.filter((f) => {
    const isWorldOrCanon = f.scope === "world" || f.sourceType === "system_canon";
    if (!isWorldOrCanon) return true; // 保持非世界事实在 forbidden 中
    // 仅当事实显式标记 xinlan_known 时才从 forbidden 移除
    return !(Array.isArray(f.tags) && f.tags.includes("xinlan_known"));
  });
}

function narrativeHitsForbidden(narrative: string, forbidden: KnowledgeFact[]): { hit: boolean; worst: EpistemicLeakType } {
  let worst: EpistemicLeakType = "none";
  let hit = false;
  for (const f of forbidden) {
    if (inputMentionsFactContent(narrative, f.content)) {
      hit = true;
      const cls = classifyForbiddenFact(f);
      if (cls === "private_fact_leak") worst = "private_fact_leak";
      else if (worst !== "private_fact_leak") worst = cls;
    }
  }
  return { hit, worst };
}

function optionsHitForbidden(options: unknown, forbidden: KnowledgeFact[]): { hit: boolean; indices: number[] } {
  const idx: number[] = [];
  if (!Array.isArray(options)) return { hit: false, indices: [] };
  options.forEach((o, i) => {
    if (typeof o !== "string") return;
    for (const f of forbidden) {
      if (inputMentionsFactContent(o, f.content)) {
        idx.push(i);
        return;
      }
    }
  });
  return { hit: idx.length > 0, indices: idx };
}

export function applyEpistemicPostGenerationValidation(input: {
  dmRecord: Record<string, unknown>;
  actorNpcId: string | null;
  presentNpcIds: string[];
  allFacts: KnowledgeFact[];
  profile: NpcEpistemicProfile | null;
  anomalyResult: EpistemicAnomalyResult | null;
  nowIso?: string;
}): { dmRecord: Record<string, unknown>; telemetry: EpistemicValidatorTelemetry } {
  const idle: EpistemicValidatorTelemetry = {
    validatorTriggered: false,
    leakType: "none",
    rewriteTriggered: false,
    rewriteReason: null,
    finalResponseSafe: true,
    involvedFields: [],
  };

  if (!enableEpistemicValidator()) {
    return { dmRecord: input.dmRecord, telemetry: idle };
  }

  const actorId = input.actorNpcId?.trim() || null;
  if (!actorId) {
    return { dmRecord: input.dmRecord, telemetry: idle };
  }

  const nowIso = input.nowIso ?? new Date().toISOString();
  const scene: EpistemicSceneContext = {
    presentNpcIds: [...new Set([...input.presentNpcIds, actorId])],
  };

  void filterFactsForActor(input.allFacts, actorId, scene, { nowIso });
  const forbidden = forbiddenListForActor(input.allFacts, actorId, scene, input.profile, nowIso);

  const out = { ...input.dmRecord };
  const involved: string[] = [];
  let leakType: EpistemicLeakType = "none";
  let rewriteTriggered = false;
  let rewriteReason: string | null = null;

  const originalNarrative = typeof out.narrative === "string" ? out.narrative : "";
  let narrativeWork = originalNarrative;

  const narForbidden = narrativeHitsForbidden(originalNarrative, forbidden);
  const anomalyConfirm = Boolean(input.anomalyResult?.anomaly && CONFIRM_RE.test(originalNarrative));

  const { hit: optHit, indices: optIdx } = optionsHitForbidden(out.options, forbidden);

  if (anomalyConfirm) {
    leakType = "overreach_acceptance";
    involved.push("narrative");
    narrativeWork = rewriteNarrativeHeavyLeak(originalNarrative, "overreach_acceptance");
    rewriteTriggered = true;
    rewriteReason = "anomaly_active_but_narrative_confirmed";
  } else if (narForbidden.hit) {
    leakType = narForbidden.worst;
    involved.push("narrative");
    const { text: scrubbed, hit: scrubOk } = scrubTextWithForbiddenFacts(originalNarrative, forbidden);
    const scrubStillForbidden = scrubOk && narrativeHitsForbidden(scrubbed, forbidden).hit;
    if (scrubOk && scrubbed.trim().length >= 24 && !scrubStillForbidden) {
      narrativeWork = scrubbed;
      rewriteTriggered = true;
      rewriteReason = "forbidden_substring_scrub";
    } else {
      narrativeWork = rewriteNarrativeHeavyLeak(
        originalNarrative,
        narForbidden.worst === "world_truth_premature" ? "world_truth_premature" : "private_fact_leak"
      );
      rewriteTriggered = true;
      rewriteReason = "heavy_template_rewrite";
    }
  } else if (
    input.anomalyResult?.anomaly &&
    originalNarrative.trim().length > 0 &&
    !/(?:不知道|没听说|什么意思|迟疑|顿住|反问|愣了一下)/.test(originalNarrative)
  ) {
    narrativeWork = appendSoftHedge(originalNarrative);
    rewriteTriggered = true;
    rewriteReason = "anomaly_soft_hedge";
    leakType = "overconfident_confirmation";
    involved.push("narrative");
  }

  if (narrativeWork !== originalNarrative) {
    out.narrative = narrativeWork;
  }

  if (optHit && Array.isArray(out.options)) {
    const opts = [...(out.options as unknown[])];
    for (const i of optIdx) {
      if (typeof opts[i] === "string") {
        const { text } = scrubTextWithForbiddenFacts(opts[i] as string, forbidden);
        opts[i] = text.trim().length < 2 ? "先追问对方消息来源" : text;
      }
    }
    out.options = opts;
    involved.push("options");
    if (!rewriteTriggered) {
      rewriteTriggered = true;
      rewriteReason = rewriteReason ?? "options_scrubbed";
    }
    if (leakType === "none") leakType = "private_fact_leak";
  }

  if (forbidden.length > 0) {
    const struct = scrubDmStructuredFields(out, forbidden);
    if (struct.mutated) {
      for (const f of struct.fields) involved.push(f);
      if (!rewriteTriggered) {
        rewriteTriggered = true;
        rewriteReason = rewriteReason ?? "structured_field_scrub";
      }
      if (leakType === "none") leakType = "private_fact_leak";
    }
  }

  const involvedFields = [...new Set(involved)];
  const validatorTriggered = rewriteTriggered || leakType !== "none";

  const telemetry: EpistemicValidatorTelemetry = {
    validatorTriggered,
    leakType,
    rewriteTriggered,
    rewriteReason,
    finalResponseSafe: true,
    involvedFields,
  };

  if (validatorTriggered) {
    const prevMeta =
      out.security_meta && typeof out.security_meta === "object" && !Array.isArray(out.security_meta)
        ? (out.security_meta as Record<string, unknown>)
        : {};
    out.security_meta = {
      ...prevMeta,
      epistemic_post_validator: telemetry,
    };
    epistemicDebugLog("post_validator_intervention", {
      actorNpcId: actorId,
      leakType: telemetry.leakType,
      rewriteTriggered: telemetry.rewriteTriggered,
      rewriteReason: telemetry.rewriteReason,
      involvedFields: telemetry.involvedFields,
    });
  }

  return { dmRecord: out, telemetry };
}
