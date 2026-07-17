import type { ProductQualityScorecard, ProductQualitySignals, QualityDimension } from "./types";

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const zFromConfidenceLevel = (confidenceLevel: number): number => confidenceLevel === 0.99 ? 2.576 : 1.96;

function wilsonInterval(successes: number, trials: number, confidenceLevel = 0.95): { lower: number; upper: number } | null {
  if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials <= 0) return null;
  const p = clamp01(successes / trials);
  const z = zFromConfidenceLevel(confidenceLevel);
  const z2 = z ** 2;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials) / denominator;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

export function percentile(values: number[], fraction: number): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil(fraction * finite.length) - 1));
  return finite[index] ?? null;
}

function confidenceFromPassRate(rate: number, runs: number, confidenceLevel: number = 0.95): number {
  if (!Number.isFinite(rate) || runs <= 0) return 0;
  const p = clamp01(Math.max(0, Math.min(1, rate)));
  const successes = Math.max(0, Math.min(runs, Math.round(p * runs)));
  const interval = wilsonInterval(successes, runs, confidenceLevel);
  if (!interval) return 0;
  return clamp01(interval.lower);
}

function evidenceForTurns(turns: number): QualityDimension["evidence"] {
  if (turns >= 100) return "strong";
  if (turns >= 30) return "moderate";
  if (turns > 0) return "weak";
  return "missing";
}

export function buildProductQualityScorecard(signals: ProductQualitySignals): ProductQualityScorecard {
  const narrativeJudgeConfidenceEvidence = typeof signals.narrativeJudgeConfidenceRaw === "number"
    ? clamp01(signals.narrativeJudgeConfidenceRaw)
    : null;
  const trustedJudgeConfidenceSampleCountFromSignal = Number.isFinite(signals.narrativeJudgeConfidenceTrustedSampleCount)
    ? Math.max(0, Math.round(signals.narrativeJudgeConfidenceTrustedSampleCount))
    : 0;
  const hasTrustedRawNarrativeJudgeConfidenceEvidence = narrativeJudgeConfidenceEvidence !== null && trustedJudgeConfidenceSampleCountFromSignal > 0;
  const hasNarrativeJudgeConfidenceEvidence = hasTrustedRawNarrativeJudgeConfidenceEvidence;
  const hasUntrustedOnlyNarrativeJudgeConfidence = narrativeJudgeConfidenceEvidence !== null && !hasTrustedRawNarrativeJudgeConfidenceEvidence;
  const narrativeJudgeConfidenceForReport = hasNarrativeJudgeConfidenceEvidence
    ? narrativeJudgeConfidenceEvidence
    : 0;
  const judgeConfidenceSampleCount = Number.isFinite(signals.narrativeJudgeConfidenceSampleCount)
    ? Math.max(0, Math.round(signals.narrativeJudgeConfidenceSampleCount))
    : 0;
  const judgeEvidenceCoverage = clamp01(signals.narrativeJudgeConfidenceCoverage ?? 0);
  const trustedJudgeEvidenceCoverage = clamp01(signals.trustedNarrativeJudgeConfidenceCoverage ?? judgeEvidenceCoverage);
  const judgeConfidenceTrustedSampleCount = Number.isFinite(signals.narrativeJudgeConfidenceTrustedSampleCount)
    ? Math.max(0, Math.round(signals.narrativeJudgeConfidenceTrustedSampleCount))
    : Math.max(0, Math.round(judgeConfidenceSampleCount * trustedJudgeEvidenceCoverage));
  const judgePassRate = clamp01(signals.judgePassRate ?? signals.passRate);
  const judgePassRuns = Number.isFinite(signals.judgePassRuns) ? Math.max(0, Math.round(signals.judgePassRuns)) : 0;
  const judgeCoverageRuns = judgePassRuns;
  const judgePassConfidence = confidenceFromPassRate(judgePassRate, Math.max(1, judgePassRuns));
  const judgePassAgreementRate = typeof signals.judgePassAgreementRate === "number" ? clamp01(signals.judgePassAgreementRate) : null;
  const judgeCodexAgreementRate = typeof signals.judgeCodexAgreementRate === "number" ? clamp01(signals.judgeCodexAgreementRate) : null;
const hasJudgeAgreementEvidence = judgePassAgreementRate !== null || judgeCodexAgreementRate !== null;
const judgeCoverageSufficiency = judgePassRuns >= 20 ? 1 : judgePassRuns / 20;
const judgeSampleSufficiency = Math.min(1, judgeConfidenceTrustedSampleCount / 12);
const allowHeuristicConfidence = process.env.VERSECRAFT_EVAL_ALLOW_HEURISTIC_CONFIDENCE === "1";
  const judgeEvidenceReliability = clamp01(
    0.35 * trustedJudgeEvidenceCoverage +
    0.25 * judgeCoverageSufficiency +
    0.20 * judgeSampleSufficiency +
    0.20 * judgePassConfidence
  );
  const judgeAgreementSignal = judgePassAgreementRate === null && judgeCodexAgreementRate === null
    ? 0
    : clamp01(0.6 * (judgePassAgreementRate ?? 0.5) + 0.4 * (judgeCodexAgreementRate ?? 0.5));
  const narrativeJudgeConfidenceAdjusted = hasNarrativeJudgeConfidenceEvidence
    ? clamp01(narrativeJudgeConfidenceEvidence * judgeEvidenceReliability * judgeAgreementSignal)
    : 0;
  const noRawNarrativeConfidence = hasJudgeAgreementEvidence
    ? clamp01(0.42 * clamp01(signals.narrativeJudgeConfidence) + 0.38 * judgeAgreementSignal + 0.20 * trustedJudgeEvidenceCoverage)
    : clamp01(0.55 * clamp01(signals.narrativeJudgeConfidence) + 0.45 * trustedJudgeEvidenceCoverage);
  const narrativeJudgeCoveragePenalty = hasNarrativeJudgeConfidenceEvidence && judgeEvidenceReliability < 0.4 ? true : false;
  const narrativeJudgmentEvidenceGate = hasNarrativeJudgeConfidenceEvidence
    ? 1
    : clamp01((0.15 + 0.5 * judgeCoverageSufficiency + 0.25 * judgeEvidenceReliability + 0.10 * judgeAgreementSignal) * (hasJudgeAgreementEvidence ? 1 : 0.55));
  const noRawNarrativeConfidenceCeiling = hasJudgeAgreementEvidence ? 0.62 : 0.50;
  const noRawJudgeReliabilityPenalty = hasNarrativeJudgeConfidenceEvidence
    ? 1
    : clamp01(0.45 + 0.35 * judgeEvidenceReliability);
  const runEvidence = signals.runs >= 20 ? "strong" : signals.runs >= 5 ? "moderate" : signals.runs > 0 ? "weak" : "missing";
  const turnEvidence = evidenceForTurns(signals.turns);
  const reliability = signals.runs === 0
    ? null
    : clamp(signals.passRate * 75 + (1 - signals.softlockRate) * 15 + (1 - signals.errorRate) * 10);
  const performance = signals.p95LatencyMs === null
    ? null
    : clamp(100 - Math.max(0, signals.p95LatencyMs - 5_000) / 150);
  const playability = signals.progressionTurnRate !== null && signals.agencyResponseRate !== null && signals.structuredConsequenceRate !== null
    ? clamp((signals.progressionTurnRate * 0.30 + signals.agencyResponseRate * 0.35 + signals.structuredConsequenceRate * 0.25 + (1 - (signals.deadTurnRate ?? 0)) * 0.10) * 100)
    : null;
  const narrativeBase = signals.narrativeScore5 === null || signals.repetitionRate === null
    ? null
    : clamp((signals.narrativeScore5 / 5 * 0.7 + (1 - signals.repetitionRate) * 0.3) * 100);
  const narrative = narrativeBase === null
    ? null
    : clamp(narrativeBase - Math.min(45, (signals.worldConsistencyIssueTurnRate ?? 0) * 55));
  const totalTokens = signals.tokenInput === null || signals.tokenOutput === null ? null : signals.tokenInput + signals.tokenOutput;
  const contextTokensPerTurn = totalTokens === null || signals.tokenCoveredTurns === 0 ? null : totalTokens / signals.tokenCoveredTurns;
  const costEquivalentPerTurn = signals.tokenCostEquivalent == null || signals.tokenCoveredTurns === 0
    ? null
    : signals.tokenCostEquivalent / signals.tokenCoveredTurns;
  // Context size and provider spend are deliberately separate. A cache hit still
  // consumes context, but charging it as a full-price miss would punish healthy
  // stable-prefix caching and drive the wrong prompt-deletion decision.
  const costEfficiency = costEquivalentPerTurn === null ? null : clamp(100 - Math.max(0, costEquivalentPerTurn - 4_000) / 100);

  const dimensions: QualityDimension[] = [
    { id: "reliability", score: reliability, weight: 0.30, evidence: runEvidence, reasons: [`conclusiveRuns=${signals.runs}`, `pass=${(signals.passRate * 100).toFixed(1)}%`, `softlock=${(signals.softlockRate * 100).toFixed(1)}%`, `error=${(signals.errorRate * 100).toFixed(1)}%`] },
    { id: "performance", score: performance, weight: 0.20, evidence: signals.p95LatencyMs === null ? "missing" : turnEvidence, reasons: [`p50=${signals.p50LatencyMs ?? "missing"}ms`, `p95=${signals.p95LatencyMs ?? "missing"}ms`] },
    { id: "playability", score: playability, weight: 0.20, evidence: playability === null ? "missing" : turnEvidence, reasons: [`progression=${signals.progressionTurnRate ?? "missing"}`, `agencyResponse=${signals.agencyResponseRate ?? "missing"}`, `structuredConsequence=${signals.structuredConsequenceRate ?? "missing"}`, `deadTurns=${signals.deadTurnRate ?? "missing"}`, `meaningfulChoice=${signals.meaningfulChoiceRate ?? "not_observed"}`] },
    {
      id: "narrative",
      score: narrative,
      weight: 0.20,
      evidence: narrative === null ? "missing" : hasNarrativeJudgeConfidenceEvidence ? (narrativeJudgeConfidenceEvidence < 0.7 ? "weak" : turnEvidence) : "missing",
      reasons: [
        `judge=${signals.narrativeScore5 ?? "missing"}/5`,
        `judgeConfidence=${signals.narrativeJudgeConfidence}（${hasNarrativeJudgeConfidenceEvidence ? "raw_ai/codex直接字段" : "noRaw推断"}）`,
        `judgeConfidenceRaw=${hasNarrativeJudgeConfidenceEvidence ? narrativeJudgeConfidenceEvidence : "missing"}`,
        `judgeRawCoverage=${judgeEvidenceCoverage.toFixed(2)}`,
        `trustedRawCoverage=${trustedJudgeEvidenceCoverage.toFixed(2)}`,
        `trustedJudgeSamples=${judgeConfidenceTrustedSampleCount}/${judgeConfidenceSampleCount}`,
        `judgePassCoverage=${judgePassRuns}`,
        `judgePassRate=${(judgePassRate * 100).toFixed(1)}%`,
        `judgeAgreement=${judgePassAgreementRate === null ? "missing" : `${(judgePassAgreementRate * 100).toFixed(1)}%`}`,
        `codexAgreement=${judgeCodexAgreementRate === null ? "missing" : `${(judgeCodexAgreementRate * 100).toFixed(1)}%`}`,
        `repetition=${signals.repetitionRate ?? "missing"}`,
        `worldIssueTurns=${signals.worldConsistencyIssueTurnRate ?? "missing"}`,
      ],
    },
    { id: "costEfficiency", score: costEfficiency, weight: 0.10, evidence: signals.tokenCoverageRate >= 0.9 ? turnEvidence : signals.tokenCoverageRate > 0 ? "weak" : "missing", reasons: [`costEquivalent/turn=${costEquivalentPerTurn === null ? "missing" : Math.round(costEquivalentPerTurn)}`, `contextTokens/turn=${contextTokensPerTurn === null ? "missing" : Math.round(contextTokensPerTurn)}`, `profile=${signals.tokenCostProfile ?? "missing"}`, `coverage=${(signals.tokenCoverageRate * 100).toFixed(1)}%`] },
  ];
  const scored = dimensions.filter((d): d is QualityDimension & { score: number } => d.score !== null);
  const weight = scored.reduce((sum, d) => sum + d.weight, 0);
  const coreComplete = reliability !== null && performance !== null && playability !== null && narrative !== null;
  const passConfidence = confidenceFromPassRate(signals.passRate, Math.max(1, signals.runs));
  const passReliability = passConfidence;
  const passRateUncertaintyPenalty = clamp01(Math.max(0.2, passConfidence * 0.55 + 0.45));
  const sampleSufficiency = Math.min(1, signals.runs / 20);
  const turnSufficiency = Math.min(1, signals.turns / 120);
  const confidenceSource: "raw_ai" | "judge_coverage_inferred" | "heuristic_only" = hasNarrativeJudgeConfidenceEvidence
    ? "raw_ai"
    : judgeCoverageRuns > 0 || judgeConfidenceSampleCount > 0 || hasJudgeAgreementEvidence || judgeCodexAgreementRate !== null || judgePassAgreementRate !== null
      ? "judge_coverage_inferred"
      : "heuristic_only";
  const confidencePathPenaltyReason: string[] = [];
  if (judgeCoverageSufficiency < 0.3) confidencePathPenaltyReason.push("judge置信覆盖不足：<30%样本有裁判评分");
  if (judgeEvidenceReliability < 0.5) confidencePathPenaltyReason.push("judge可靠性低于0.5");
  if (judgePassConfidence < 0.5) confidencePathPenaltyReason.push("judge通过率不稳定（Wilson下界<0.5）");
  if (sampleSufficiency < 0.5) confidencePathPenaltyReason.push("样本量不足：run<10");
  if (turnSufficiency < 0.25) confidencePathPenaltyReason.push("回合样本不足：turn<30");
  if (!hasNarrativeJudgeConfidenceEvidence) {
    confidencePathPenaltyReason.push("缺少原始AI/Codex置信输出，采用保守推断路径");
  }
  if (trustedJudgeEvidenceCoverage < 0.1) {
    confidencePathPenaltyReason.push("高可信裁判置信覆盖不足：<10% run拥有AI/Codex原始置信");
  }
  if (hasUntrustedOnlyNarrativeJudgeConfidence) {
    confidencePathPenaltyReason.push("原始置信仅来源于非AI/Codex（mock/fallback/estimated），已按推断路径处理");
  }
  const confidenceComponents = hasNarrativeJudgeConfidenceEvidence
    ? [
      { name: "passReliability", value: passReliability, weight: 0.30, note: `Wilson下界(${Math.min(1, signals.runs / 20).toFixed(2)})` },
      { name: "judgePassReliability", value: judgePassConfidence, weight: 0.15, note: `judgePass下界(${judgePassRuns})` },
      { name: "judgeRawAdjusted", value: narrativeJudgeConfidenceAdjusted, weight: 0.28, note: `rawJudge=${narrativeJudgeConfidenceEvidence?.toFixed(2)}` },
      { name: "judgeEvidenceReliability", value: judgeEvidenceReliability, weight: 0.10, note: `coverage=${trustedJudgeEvidenceCoverage.toFixed(2)} agreement=${judgeAgreementSignal.toFixed(2)}` },
      { name: "sampleSuff", value: sampleSufficiency, weight: 0.10, note: `runs=${signals.runs}` },
      { name: "turnSuff", value: turnSufficiency, weight: 0.10, note: `turns=${signals.turns}` },
      { name: "passCI", value: passRateUncertaintyPenalty, weight: 0.07, note: `passLower=${passConfidence.toFixed(3)}` },
    ]
    : [
      { name: "passReliability", value: passReliability, weight: 0.30, note: `Wilson下界(${Math.min(1, signals.runs / 20).toFixed(2)})` },
      { name: "judgePassReliability", value: judgePassConfidence, weight: 0.20, note: `judgePass下界(${judgePassRuns})` },
      { name: "noRawNarrative", value: noRawNarrativeConfidence, weight: 0.17, note: "未拿到raw置信，使用judgment推断" },
      { name: "judgeAgreement", value: judgeAgreementSignal, weight: 0.10, note: "mock/live&codex一致性加权" },
      { name: "sampleSuff", value: sampleSufficiency, weight: 0.12, note: `runs=${signals.runs}` },
      { name: "turnSuff", value: turnSufficiency, weight: 0.10, note: `turns=${signals.turns}` },
      { name: "passCI", value: passRateUncertaintyPenalty, weight: 0.09, note: `passLower=${passConfidence.toFixed(3)}` },
    ];
  const confidenceWeightTotal = confidenceComponents.reduce((sum, item) => sum + item.weight, 0);
  const normalizedConfidenceBase = confidenceComponents.reduce((sum, item) => sum + item.value * (item.weight / confidenceWeightTotal), 0);
  const confidenceSourcePenalty = confidenceSource === "raw_ai" ? 1 : confidenceSource === "judge_coverage_inferred" ? 0.85 : 0.6;
  const confidenceBase = hasNarrativeJudgeConfidenceEvidence
    ? clamp01(normalizedConfidenceBase * narrativeJudgmentEvidenceGate * judgeEvidenceReliability * noRawJudgeReliabilityPenalty + narrativeJudgeConfidenceAdjusted * 0.05)
    : clamp01(normalizedConfidenceBase * narrativeJudgmentEvidenceGate * noRawJudgeReliabilityPenalty);
const confidenceCapFromNarrativeEvidence = (() => {
  const noRawJudgeConfidenceHardCap = 0.5;
  if (hasNarrativeJudgeConfidenceEvidence) {
    if (judgePassConfidence < 0.35 || judgeEvidenceReliability < 0.45) return 0.9;
    return 1;
  }
  if (!allowHeuristicConfidence) {
    return Math.min(0.5, noRawJudgeConfidenceHardCap);
  }
  if (judgeCoverageRuns >= 60 || judgePassRate >= 0.95) return 0.72;
  if (judgeCoverageRuns >= 20 || judgePassConfidence >= 0.6) return 0.68;
  return 0.62;
})();
  const confidenceBaseWithCap = clamp01(confidenceBase * confidenceCapFromNarrativeEvidence);
  const confidenceNoSourcePenalty = confidenceSource === "raw_ai"
    ? confidenceBaseWithCap
    : Math.min(noRawNarrativeConfidenceCeiling, confidenceBaseWithCap);
  const confidence = clamp01(confidenceNoSourcePenalty * confidenceSourcePenalty);
  const overallScore = coreComplete && weight > 0 ? scored.reduce((sum, d) => sum + d.score * d.weight, 0) / weight : null;
  const blockers: string[] = [];
  const recommendations: string[] = [];
  if (signals.tokenCoverageRate < 0.9) blockers.push("token_evidence_incomplete");
  if (signals.agencyResponseRate === null) blockers.push("agency_response_evidence_missing");
  if (signals.structuredConsequenceRate === null) blockers.push("structured_consequence_evidence_missing");
  if (signals.narrativeScore5 === null) blockers.push("narrative_judge_evidence_missing");
  if (!hasNarrativeJudgeConfidenceEvidence) blockers.push("narrative_judge_confidence_sample_missing");
  if (judgeCoverageSufficiency < 0.3) blockers.push("narrative_judge_confidence_evidence_sparse");
  if (narrativeJudgeConfidenceForReport < 0.7) blockers.push("narrative_judge_confidence_low");
  if (narrativeJudgeCoveragePenalty) blockers.push("narrative_judge_evidence_low_reliability");
  if (!coreComplete) blockers.push("overall_score_withheld_incomplete_core_evidence");
  if (confidence < 0.7) blockers.push("overall_decision_confidence_low");
  if (signals.softlockRate > 0.02) recommendations.push("优先修复 softlock；它直接破坏长程完成率。 ");
  if (signals.repetitionRate !== null && signals.repetitionRate > 0.15) recommendations.push("降低重复叙事与无效回合。 ");
  if (signals.worldConsistencyIssueTurnRate !== null && signals.worldConsistencyIssueTurnRate > 0.1) recommendations.push("优先减少虚构 NPC、关系和不受支持事实；文笔分不能抵消世界一致性缺陷。 ");
  if (signals.progressionTurnRate !== null && signals.progressionTurnRate < 0.35) recommendations.push("压缩低推进功能或流程；先做 A/B，再决定删除。 ");
  if (signals.agencyResponseRate !== null && signals.agencyResponseRate < 0.9) recommendations.push("优先修复行动未被明确响应的回合；自然语言能动性是核心体验。 ");
  if (signals.deadTurnRate !== null && signals.deadTurnRate > 0.15) recommendations.push("压缩无状态后果、无明确裁决的空转回合；它们消耗 token 但不形成玩法。 ");
  if (signals.tokenCoverageRate < 0.9) recommendations.push("把 provider token usage 写入匿名化逐回合 artifact，才能评价真实成本。 ");
  return {
    version: "product-quality-v1",
    overallScore,
    confidence,
    confidenceTrace: {
      source: confidenceSource,
      rawEvidenceUsed: hasNarrativeJudgeConfidenceEvidence,
      evidenceComponents: confidenceComponents
        .map((item, index) => ({
          ...item,
          weight: item.weight / confidenceWeightTotal,
          value: clamp01(item.value),
          note: index === 0 ? item.note : item.note,
        })),
      confidencePathPenaltyReason: confidencePathPenaltyReason.length === 0
        ? ["无额外降权路径：原始裁判置信和覆盖样本均足够"]
        : confidencePathPenaltyReason,
      evidenceFloor: confidenceSource === "raw_ai" ? 0.55 : confidenceSource === "judge_coverage_inferred" ? 0.35 : 0.2,
      evidenceSummary: {
        sampleRuns: signals.runs,
        turnSamples: signals.turns,
        judgeCoverageRuns,
        judgeConfidenceSamples: judgeConfidenceSampleCount,
        trustedJudgeConfidenceSamples: judgeConfidenceTrustedSampleCount,
        judgePassRate,
        judgePassAgreementRate,
        judgeCodexAgreementRate,
      },
    },
    dimensions,
    blockers,
    recommendations,
  };
}
