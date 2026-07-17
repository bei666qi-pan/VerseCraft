import type { PlaythroughTranscript } from "@/lib/evals/playthrough/types";

export type SubjectivePlayabilityDimension = "actionPayoff" | "tensionArc" | "novelty" | "choiceMeaning" | "clarity" | "continueDesire";

export interface SubjectivePlayabilityAssessment {
  version: "subjective-playability-proxy-v1";
  source: "heuristic_proxy" | "llm_judge" | "human";
  confidence: number;
  overallScore5: number;
  dimensions: Record<SubjectivePlayabilityDimension, number>;
  evidence: string[];
  limitations: string[];
}

const clamp5 = (value: number) => Math.max(1, Math.min(5, value));

function hasDelta(dm: Record<string, unknown>): boolean {
  const keys = ["new_tasks", "task_updates", "awarded_items", "consumed_items", "clue_updates", "main_threat_updates", "weapon_updates", "weapon_bag_updates"];
  return keys.some((key) => Array.isArray(dm[key]) && (dm[key] as unknown[]).length > 0)
    || (typeof dm.currency_change === "number" && dm.currency_change !== 0)
    || typeof dm.player_location === "string" || dm.conflict_outcome != null || dm.profession_trial_result != null
    || (typeof dm.sanity_damage === "number" && dm.sanity_damage !== 0) || dm.is_death === true;
}

/**
 * Free deterministic proxy used for triage and sampling priority only.
 * It is deliberately low-confidence and must never be presented as human fun evidence.
 */
export function assessSubjectivePlayabilityProxy(transcript: PlaythroughTranscript): SubjectivePlayabilityAssessment {
  // Deterministic audits/refusals validate mechanics but are not story beats;
  // scoring them as entertainment systematically punishes low-cost architecture.
  const steps = transcript.steps.filter((step) => {
    const dm = (step.dmJson ?? {}) as Record<string, unknown>;
    const meta = dm.security_meta;
    return !(meta && typeof meta === "object" && !Array.isArray(meta) && (meta as Record<string, unknown>).deterministic_service_fast_lane === true);
  });
  if (steps.length === 0) return {
    version: "subjective-playability-proxy-v1", source: "heuristic_proxy", confidence: 0.1, overallScore5: 1,
    dimensions: { actionPayoff: 1, tensionArc: 1, novelty: 1, choiceMeaning: 1, clarity: 1, continueDesire: 1 },
    evidence: ["empty_transcript"], limitations: ["没有可评分回合。"],
  };

  let mutationAttempts = 0;
  let resolvedMutations = 0;
  let beatTurns = 0;
  let choiceTurns = 0;
  let differentiatedChoiceTurns = 0;
  let clearTurns = 0;
  let hookTurns = 0;
  const sentenceFingerprints: string[] = [];

  for (const step of steps) {
    const action = String(step.playerAction ?? "");
    const narrative = String(step.narrative ?? "");
    const dm = (step.dmJson ?? {}) as Record<string, unknown>;
    const readOnly = /^(?:检查|查看|核对|确认|询问|观察|寻找)/.test(action);
    const mutation = !readOnly && /攻击|反击|压制|交付|领取|装备|锻造|修理|购买|出售|拾取|进入|离开|前往|认证|提交/.test(action);
    if (mutation) {
      mutationAttempts += 1;
      if (hasDelta(dm) || dm.is_action_legal === false || /已经|无需|没有可|无法|不能|不会重复|未满足|前置不足|未认证|保持|仍为|确认|不补写|不新增/.test(narrative)) resolvedMutations += 1;
    }
    if (hasDelta(dm) || /危险|阴影|追来|逼近|发现|揭开|真相|异常/.test(narrative)) beatTurns += 1;
    const rawOptions = Array.isArray(dm.decision_options) && dm.decision_options.length ? dm.decision_options : dm.options;
    const options = Array.isArray(rawOptions) ? rawOptions.filter((item): item is string => typeof item === "string") : [];
    if (options.length > 0) {
      choiceTurns += 1;
      if (new Set(options.map((item) => item.replace(/\s+/g, ""))).size >= 2) differentiatedChoiceTurns += 1;
    }
    if (narrative.length >= 60 && narrative.length <= 1400 && !/JSON|系统提示词|作为AI|战术裁决/.test(narrative)) clearTurns += 1;
    if (/[？?!！]$/.test(narrative.trim()) || /却在这时|身后|门后|还没有结束|仍未|要不要|下一步/.test(narrative.slice(-180))) hookTurns += 1;
    for (const unit of narrative.split(/[。！？\n]+/).map((text) => text.replace(/\s+/g, "")).filter((text) => text.length >= 12)) sentenceFingerprints.push(unit.slice(0, 48));
  }

  const payoffRate = mutationAttempts ? resolvedMutations / mutationAttempts : 0.5;
  const beatRate = beatTurns / steps.length;
  const choiceRate = choiceTurns ? differentiatedChoiceTurns / choiceTurns : 0.5;
  const clarityRate = clearTurns / steps.length;
  const hookRate = hookTurns / steps.length;
  const uniqueRate = sentenceFingerprints.length ? new Set(sentenceFingerprints).size / sentenceFingerprints.length : 0;
  const dimensions = {
    actionPayoff: clamp5(1 + payoffRate * 4),
    tensionArc: clamp5(1 + Math.min(1, beatRate / 0.65) * 4),
    novelty: clamp5(1 + uniqueRate * 4),
    choiceMeaning: clamp5(1 + choiceRate * 4),
    clarity: clamp5(1 + clarityRate * 4),
    continueDesire: clamp5(1 + hookRate * 4),
  };
  const overallScore5 = Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.keys(dimensions).length;
  return {
    version: "subjective-playability-proxy-v1", source: "heuristic_proxy", confidence: 0.25, overallScore5, dimensions,
    evidence: [`mutation_payoff=${resolvedMutations}/${mutationAttempts}`, `beat_turns=${beatTurns}/${steps.length}`, `choice_turns=${differentiatedChoiceTurns}/${choiceTurns}`, `clear_turns=${clearTurns}/${steps.length}`, `hook_turns=${hookTurns}/${steps.length}`, `unique_sentence_rate=${uniqueRate.toFixed(3)}`],
    limitations: ["这是零成本启发式代理，不代表真人是否觉得好玩。", "没有真人盲测或成对偏好数据时，不得用于删除功能。"],
  };
}
