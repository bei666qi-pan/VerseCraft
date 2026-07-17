import assert from "node:assert/strict";
import test from "node:test";
import { buildProductQualityScorecard, percentile } from "./scorecard";

test("percentile is deterministic and ignores non-finite samples", () => {
  assert.equal(percentile([10, 30, 20, Number.NaN], 0.5), 20);
  assert.equal(percentile([10, 30, 20], 0.95), 30);
  assert.equal(percentile([], 0.95), null);
});

test("scorecard never invents missing cost evidence and does not require UI choices for natural-language agency", () => {
  const score = buildProductQualityScorecard({ runs: 5, turns: 20, passRate: 1, softlockRate: 0, errorRate: 0, p50LatencyMs: 2000, p95LatencyMs: 5000, narrativeScore5: 4, narrativeJudgeConfidence: 0.4, repetitionRate: 0.05, worldConsistencyIssueTurnRate: 0, progressionTurnRate: 0.5, agencyResponseRate: 0.95, meaningfulChoiceRate: null, structuredConsequenceRate: 0.7, deadTurnRate: 0.1, tokenInput: null, tokenOutput: null, tokenCoveredTurns: 0, tokenCoverageRate: 0 });
  assert.equal(score.dimensions.find((d) => d.id === "costEfficiency")?.score, null);
  assert.ok(score.blockers.includes("token_evidence_incomplete"));
  assert.ok(!score.blockers.includes("agency_response_evidence_missing"));
  assert.ok(score.overallScore !== null);
  assert.ok(score.confidence < 1);
  assert.ok(score.blockers.includes("overall_decision_confidence_low"));
});

test("high failure, softlock and latency produce a visibly low score", () => {
  const score = buildProductQualityScorecard({ runs: 30, turns: 200, passRate: 0.5, softlockRate: 0.2, errorRate: 0.1, p50LatencyMs: 8000, p95LatencyMs: 20000, narrativeScore5: 2.5, narrativeJudgeConfidence: 0.4, repetitionRate: 0.3, worldConsistencyIssueTurnRate: 0.3, progressionTurnRate: 0.2, agencyResponseRate: 0.2, meaningfulChoiceRate: 0.2, structuredConsequenceRate: 0.2, deadTurnRate: 0.6, tokenInput: 1_000_000, tokenOutput: 300_000, tokenCoveredTurns: 200, tokenCoverageRate: 1 });
  assert.ok((score.overallScore ?? 100) < 60);
  assert.ok(score.recommendations.length >= 3);
});

test("cost uses only turns with token evidence", () => {
  const score = buildProductQualityScorecard({ runs: 10, turns: 100, passRate: 1, softlockRate: 0, errorRate: 0, p50LatencyMs: 2000, p95LatencyMs: 4000, narrativeScore5: 4, narrativeJudgeConfidence: 0.4, repetitionRate: 0.05, worldConsistencyIssueTurnRate: 0, progressionTurnRate: 0.6, agencyResponseRate: 1, meaningfulChoiceRate: null, structuredConsequenceRate: 0.8, deadTurnRate: 0.05, tokenInput: 40_000, tokenOutput: 5_000, tokenCostEquivalent: 32_000, tokenCostProfile: "test-profile", tokenCoveredTurns: 10, tokenCoverageRate: 0.1 });
  const reasons = score.dimensions.find((d) => d.id === "costEfficiency")?.reasons ?? [];
  assert.ok(reasons.includes("costEquivalent/turn=3200"));
  assert.ok(reasons.includes("contextTokens/turn=4500"));
  assert.ok(reasons.includes("profile=test-profile"));
});

test("cached context is not silently scored as full-price provider spend", () => {
  const common = { runs: 10, turns: 10, passRate: 1, softlockRate: 0, errorRate: 0, p50LatencyMs: 2000, p95LatencyMs: 4000, narrativeScore5: 4, narrativeJudgeConfidence: 0.8, repetitionRate: 0.05, worldConsistencyIssueTurnRate: 0, progressionTurnRate: 0.6, agencyResponseRate: 1, meaningfulChoiceRate: null, structuredConsequenceRate: 0.8, deadTurnRate: 0.05, tokenInput: 100_000, tokenOutput: 5_000, tokenCoveredTurns: 10, tokenCoverageRate: 1, tokenCostProfile: "test-profile" } as const;
  const cached = buildProductQualityScorecard({ ...common, tokenCachedInput: 80_000, tokenCostEquivalent: 31_600 });
  const uncached = buildProductQualityScorecard({ ...common, tokenCachedInput: 0, tokenCostEquivalent: 110_000 });
  const cost = (score: typeof cached) => score.dimensions.find((dimension) => dimension.id === "costEfficiency")?.score ?? -1;
  assert.ok(cost(cached) > cost(uncached));
});

test("tiny pass-rate sample keeps confidence conservative", () => {
  const tiny = buildProductQualityScorecard({
    runs: 1,
    turns: 1,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1200,
    p95LatencyMs: 2200,
    narrativeScore5: 5,
    narrativeJudgeConfidence: 0.5,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 1,
    agencyResponseRate: 1,
    meaningfulChoiceRate: null,
    structuredConsequenceRate: 0.5,
    deadTurnRate: 0,
    tokenInput: 1000,
    tokenOutput: 200,
    tokenCostEquivalent: 1000,
    tokenCostProfile: "test",
    tokenCoveredTurns: 1,
    tokenCoverageRate: 1,
  });
  const largerSample = buildProductQualityScorecard({
    runs: 100,
    turns: 120,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1200,
    p95LatencyMs: 2200,
    narrativeScore5: 5,
    narrativeJudgeConfidence: 0.5,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 1,
    agencyResponseRate: 1,
    meaningfulChoiceRate: null,
    structuredConsequenceRate: 0.5,
    deadTurnRate: 0,
    tokenInput: 1000,
    tokenOutput: 200,
    tokenCostEquivalent: 1000,
    tokenCostProfile: "test",
    tokenCoveredTurns: 1,
    tokenCoverageRate: 1,
  });

  assert.ok(tiny.confidence < 0.7);
  assert.ok(largerSample.confidence > tiny.confidence);
  assert.ok(tiny.confidence < largerSample.confidence);
});

test("world consistency defects reduce a superficially perfect narrative score", () => {
  const clean = buildProductQualityScorecard({ runs: 20, turns: 100, passRate: 1, softlockRate: 0, errorRate: 0, p50LatencyMs: 2000, p95LatencyMs: 4000, narrativeScore5: 5, narrativeJudgeConfidence: 0.4, repetitionRate: 0, worldConsistencyIssueTurnRate: 0, progressionTurnRate: 0.7, agencyResponseRate: 1, meaningfulChoiceRate: null, structuredConsequenceRate: 0.8, deadTurnRate: 0.05, tokenInput: 40_000, tokenOutput: 5_000, tokenCoveredTurns: 10, tokenCoverageRate: 0.1 });
  const unsafe = buildProductQualityScorecard({ runs: 20, turns: 100, passRate: 1, softlockRate: 0, errorRate: 0, p50LatencyMs: 2000, p95LatencyMs: 4000, narrativeScore5: 5, narrativeJudgeConfidence: 0.4, repetitionRate: 0, worldConsistencyIssueTurnRate: 0.8, progressionTurnRate: 0.7, agencyResponseRate: 1, meaningfulChoiceRate: null, structuredConsequenceRate: 0.8, deadTurnRate: 0.05, tokenInput: 40_000, tokenOutput: 5_000, tokenCoveredTurns: 10, tokenCoverageRate: 0.1 });
  const narrative = (score: typeof clean) => score.dimensions.find((d) => d.id === "narrative")?.score ?? 0;
  assert.ok(narrative(clean) - narrative(unsafe) >= 40);
});

test("no conclusive runs withholds reliability instead of inventing a failure score", () => {
  const score = buildProductQualityScorecard({ runs: 0, turns: 2, passRate: 0, softlockRate: 0, errorRate: 0, p50LatencyMs: 2000, p95LatencyMs: 4000, narrativeScore5: 4, narrativeJudgeConfidence: 0.4, repetitionRate: 0, worldConsistencyIssueTurnRate: 0, progressionTurnRate: 0.5, agencyResponseRate: 1, meaningfulChoiceRate: null, structuredConsequenceRate: null, deadTurnRate: null, tokenInput: 20_000, tokenOutput: 500, tokenCostEquivalent: 5_000, tokenCostProfile: "test", tokenCoveredTurns: 2, tokenCoverageRate: 1 });
  assert.equal(score.dimensions.find((dimension) => dimension.id === "reliability")?.score, null);
  assert.ok(score.blockers.includes("overall_score_withheld_incomplete_core_evidence"));
});

test("if narrative judge raw confidence missing, confidence gate stays conservative", () => {
  const score = buildProductQualityScorecard({
    runs: 4,
    turns: 20,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1500,
    p95LatencyMs: 2500,
    narrativeScore5: 4.6,
    narrativeJudgeConfidence: 0.9,
    repetitionRate: 0.02,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.8,
    agencyResponseRate: 0.95,
    meaningfulChoiceRate: 0.7,
    structuredConsequenceRate: 0.8,
    deadTurnRate: 0.02,
    tokenInput: 10_000,
    tokenOutput: 2_500,
    tokenCostEquivalent: 900,
    tokenCostProfile: "test",
    tokenCoveredTurns: 70,
    tokenCoverageRate: 0.875,
  });

  assert.ok(score.blockers.includes("narrative_judge_confidence_sample_missing"));
  assert.ok(score.blockers.includes("narrative_judge_confidence_low"));
  assert.ok(score.confidence < 0.7);
});

test("high raw judge confidence with sparse judge coverage is downweighted", () => {
  const sparse = buildProductQualityScorecard({
    runs: 1,
    turns: 1,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1000,
    p95LatencyMs: 2000,
    narrativeScore5: 5,
    narrativeJudgeConfidence: 0.8,
    narrativeJudgeConfidenceRaw: 0.95,
    narrativeJudgeConfidenceSampleCount: 1,
    narrativeJudgeConfidenceCoverage: 0.05,
    trustedNarrativeJudgeConfidenceCoverage: 0.05,
    judgePassRate: 1,
    judgePassRuns: 1,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 1,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.5,
    agencyResponseRate: 1,
    meaningfulChoiceRate: null,
    structuredConsequenceRate: 1,
    deadTurnRate: 0,
    tokenInput: 1000,
    tokenOutput: 200,
    tokenCostEquivalent: 1000,
    tokenCostProfile: "test",
    tokenCoveredTurns: 1,
    tokenCoverageRate: 1,
  });
  const robust = buildProductQualityScorecard({
    runs: 20,
    turns: 20,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1000,
    p95LatencyMs: 2000,
    narrativeScore5: 5,
    narrativeJudgeConfidence: 0.8,
    narrativeJudgeConfidenceRaw: 0.95,
    narrativeJudgeConfidenceSampleCount: 40,
    narrativeJudgeConfidenceCoverage: 1,
    trustedNarrativeJudgeConfidenceCoverage: 1,
    judgePassRate: 1,
    judgePassRuns: 20,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 1,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.5,
    agencyResponseRate: 1,
    meaningfulChoiceRate: null,
    structuredConsequenceRate: 1,
    deadTurnRate: 0,
    tokenInput: 1000,
    tokenOutput: 200,
    tokenCostEquivalent: 1000,
    tokenCostProfile: "test",
    tokenCoveredTurns: 20,
    tokenCoverageRate: 1,
  });

  assert.ok(sparse.confidence < 0.7);
  assert.ok(sparse.blockers.includes("narrative_judge_confidence_evidence_sparse"));
  assert.ok(robust.confidence > sparse.confidence);
});

test("many non-trusted judge confidence samples should not lift confidence", () => {
  const pseudoOnly = buildProductQualityScorecard({
    runs: 30,
    turns: 160,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1300,
    p95LatencyMs: 2200,
    narrativeScore5: 4.9,
    narrativeJudgeConfidence: 0.91,
    repetitionRate: 0.02,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.82,
    agencyResponseRate: 0.98,
    meaningfulChoiceRate: 0.88,
    structuredConsequenceRate: 0.94,
    deadTurnRate: 0.01,
    tokenInput: 10000,
    tokenOutput: 1200,
    tokenCostEquivalent: 1200,
    tokenCostProfile: "test",
    tokenCoveredTurns: 160,
    tokenCoverageRate: 1,
    narrativeJudgeConfidenceSampleCount: 100,
    narrativeJudgeConfidenceCoverage: 1,
    trustedNarrativeJudgeConfidenceCoverage: 0,
    judgePassRate: 1,
    judgePassRuns: 30,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 0.98,
  });
  const trustedOnly = buildProductQualityScorecard({
    runs: 30,
    turns: 160,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1300,
    p95LatencyMs: 2200,
    narrativeScore5: 4.9,
    narrativeJudgeConfidence: 0.91,
    repetitionRate: 0.02,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.82,
    agencyResponseRate: 0.98,
    meaningfulChoiceRate: 0.88,
    structuredConsequenceRate: 0.94,
    deadTurnRate: 0.01,
    tokenInput: 10000,
    tokenOutput: 1200,
    tokenCostEquivalent: 1200,
    tokenCostProfile: "test",
    tokenCoveredTurns: 160,
    tokenCoverageRate: 1,
    narrativeJudgeConfidenceSampleCount: 100,
    narrativeJudgeConfidenceCoverage: 1,
    trustedNarrativeJudgeConfidenceCoverage: 1,
    narrativeJudgeConfidenceTrustedSampleCount: 100,
    judgePassRate: 1,
    judgePassRuns: 30,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 0.98,
  });

  assert.ok(pseudoOnly.confidence < trustedOnly.confidence);
  assert.equal(pseudoOnly.confidenceTrace.evidenceSummary.trustedJudgeConfidenceSamples, 0);
  assert.ok(trustedOnly.confidenceTrace.evidenceSummary.trustedJudgeConfidenceSamples > 0);
});

test("explicit trusted sample count should dominate coverage when provided", () => {
  const maskedTrusted = buildProductQualityScorecard({
    runs: 30,
    turns: 160,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1300,
    p95LatencyMs: 2200,
    narrativeScore5: 4.9,
    narrativeJudgeConfidence: 0.91,
    repetitionRate: 0.02,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.82,
    agencyResponseRate: 0.98,
    meaningfulChoiceRate: 0.88,
    structuredConsequenceRate: 0.94,
    deadTurnRate: 0.01,
    tokenInput: 10000,
    tokenOutput: 1200,
    tokenCostEquivalent: 1200,
    tokenCostProfile: "test",
    tokenCoveredTurns: 160,
    tokenCoverageRate: 1,
    narrativeJudgeConfidenceSampleCount: 100,
    narrativeJudgeConfidenceCoverage: 1,
    trustedNarrativeJudgeConfidenceCoverage: 1,
    narrativeJudgeConfidenceTrustedSampleCount: 0,
    judgePassRate: 1,
    judgePassRuns: 30,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 0.98,
  });
  const fullyTrusted = buildProductQualityScorecard({
    runs: 30,
    turns: 160,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1300,
    p95LatencyMs: 2200,
    narrativeScore5: 4.9,
    narrativeJudgeConfidence: 0.91,
    repetitionRate: 0.02,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.82,
    agencyResponseRate: 0.98,
    meaningfulChoiceRate: 0.88,
    structuredConsequenceRate: 0.94,
    deadTurnRate: 0.01,
    tokenInput: 10000,
    tokenOutput: 1200,
    tokenCostEquivalent: 1200,
    tokenCostProfile: "test",
    tokenCoveredTurns: 160,
    tokenCoverageRate: 1,
    narrativeJudgeConfidenceSampleCount: 100,
    narrativeJudgeConfidenceCoverage: 1,
    trustedNarrativeJudgeConfidenceCoverage: 1,
    narrativeJudgeConfidenceTrustedSampleCount: 100,
    judgePassRate: 1,
    judgePassRuns: 30,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 0.98,
  });

  assert.equal(maskedTrusted.confidenceTrace.evidenceSummary.trustedJudgeConfidenceSamples, 0);
  assert.ok(fullyTrusted.confidenceTrace.evidenceSummary.trustedJudgeConfidenceSamples > 0);
  assert.ok(maskedTrusted.confidence <= fullyTrusted.confidence * 0.92);
});

test("raw confidence from mock-only evidence should downgrade to inferred confidence source", () => {
  const mockOnlyRaw = buildProductQualityScorecard({
    runs: 30,
    turns: 160,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1300,
    p95LatencyMs: 2200,
    narrativeScore5: 4.9,
    narrativeJudgeConfidence: 0.91,
    narrativeJudgeConfidenceRaw: 0.95,
    narrativeJudgeConfidenceSampleCount: 30,
    narrativeJudgeConfidenceCoverage: 1,
    trustedNarrativeJudgeConfidenceCoverage: 0,
    narrativeJudgeConfidenceTrustedSampleCount: 0,
    judgePassRate: 1,
    judgePassRuns: 30,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 0.98,
    repetitionRate: 0.02,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.82,
    agencyResponseRate: 0.98,
    meaningfulChoiceRate: 0.88,
    structuredConsequenceRate: 0.94,
    deadTurnRate: 0.01,
    tokenInput: 10000,
    tokenOutput: 1200,
    tokenCostEquivalent: 1200,
    tokenCostProfile: "test",
    tokenCoveredTurns: 160,
    tokenCoverageRate: 1,
  });
  assert.equal(mockOnlyRaw.confidenceTrace.source, "judge_coverage_inferred");
  assert.ok(mockOnlyRaw.blockers.includes("narrative_judge_confidence_sample_missing"));
  assert.ok(mockOnlyRaw.confidence < 0.3);
});

test("trusted sample count must be explicitly provided for raw-ai confidence", () => {
  const inferred = buildProductQualityScorecard({
    runs: 80,
    turns: 260,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1400,
    p95LatencyMs: 2200,
    narrativeScore5: 4.8,
    narrativeJudgeConfidence: 0.93,
    narrativeJudgeConfidenceRaw: 0.95,
    narrativeJudgeConfidenceSampleCount: 40,
    narrativeJudgeConfidenceCoverage: 1,
    trustedNarrativeJudgeConfidenceCoverage: 1,
    narrativeJudgeConfidenceTrustedSampleCount: 0,
    judgePassRate: 1,
    judgePassRuns: 80,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 0.98,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.85,
    agencyResponseRate: 1,
    meaningfulChoiceRate: 0.9,
    structuredConsequenceRate: 0.94,
    deadTurnRate: 0.01,
    tokenInput: 10000,
    tokenOutput: 1200,
    tokenCostEquivalent: 1200,
    tokenCostProfile: "test",
    tokenCoveredTurns: 260,
    tokenCoverageRate: 1,
  });
  const trusted = buildProductQualityScorecard({
    runs: 80,
    turns: 260,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1400,
    p95LatencyMs: 2200,
    narrativeScore5: 4.8,
    narrativeJudgeConfidence: 0.93,
    narrativeJudgeConfidenceRaw: 0.95,
    narrativeJudgeConfidenceSampleCount: 40,
    narrativeJudgeConfidenceCoverage: 1,
    trustedNarrativeJudgeConfidenceCoverage: 1,
    narrativeJudgeConfidenceTrustedSampleCount: 40,
    judgePassRate: 1,
    judgePassRuns: 80,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 0.98,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.85,
    agencyResponseRate: 1,
    meaningfulChoiceRate: 0.9,
    structuredConsequenceRate: 0.94,
    deadTurnRate: 0.01,
    tokenInput: 10000,
    tokenOutput: 1200,
    tokenCostEquivalent: 1200,
    tokenCostProfile: "test",
    tokenCoveredTurns: 260,
    tokenCoverageRate: 1,
  });

  assert.equal(inferred.confidenceTrace.source, "judge_coverage_inferred");
  assert.equal(inferred.confidenceTrace.rawEvidenceUsed, false);
  assert.equal(trusted.confidenceTrace.source, "raw_ai");
  assert.equal(trusted.confidenceTrace.rawEvidenceUsed, true);
  assert.ok(trusted.confidence > inferred.confidence);
  assert.ok(inferred.confidence < 0.72);
  assert.ok(inferred.blockers.includes("narrative_judge_confidence_sample_missing"));
});


test("large gameplay sample without narrative judge raw confidence remains conservative", () => {
  const noJudgementSignal = buildProductQualityScorecard({
    runs: 100,
    turns: 320,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1200,
    p95LatencyMs: 2000,
    narrativeScore5: 5,
    narrativeJudgeConfidence: 0.93,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.8,
    agencyResponseRate: 1,
    meaningfulChoiceRate: null,
    structuredConsequenceRate: 0.95,
    deadTurnRate: 0.01,
    tokenInput: 20_000,
    tokenOutput: 2_000,
    tokenCostEquivalent: 2_400,
    tokenCostProfile: "test",
    tokenCoveredTurns: 320,
    tokenCoverageRate: 1,
  });

  assert.ok(noJudgementSignal.blockers.includes("narrative_judge_confidence_sample_missing"));
  assert.ok(noJudgementSignal.blockers.includes("overall_decision_confidence_low"));
  assert.ok(noJudgementSignal.confidence < 0.7);
  assert.ok(noJudgementSignal.confidence < 0.65);
});

test("no raw confidence score can rise with strong judge/codex agreement evidence", () => {
  const noAgreement = buildProductQualityScorecard({
    runs: 80,
    turns: 260,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1300,
    p95LatencyMs: 2200,
    narrativeScore5: 4.8,
    narrativeJudgeConfidence: 0.92,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.85,
    agencyResponseRate: 1,
    meaningfulChoiceRate: null,
    structuredConsequenceRate: 0.9,
    deadTurnRate: 0.01,
    tokenInput: 12_000,
    tokenOutput: 1_800,
    tokenCostEquivalent: 800,
    tokenCostProfile: "test",
    tokenCoveredTurns: 100,
    tokenCoverageRate: 1,
  });

  const withAgreement = buildProductQualityScorecard({
    runs: 80,
    turns: 260,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1300,
    p95LatencyMs: 2200,
    narrativeScore5: 4.8,
    narrativeJudgeConfidence: 0.92,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.85,
    agencyResponseRate: 1,
    meaningfulChoiceRate: null,
    structuredConsequenceRate: 0.9,
    deadTurnRate: 0.01,
    tokenInput: 12_000,
    tokenOutput: 1_800,
    tokenCostEquivalent: 800,
    tokenCostProfile: "test",
    tokenCoveredTurns: 100,
    tokenCoverageRate: 1,
    judgePassRate: 1,
    judgePassRuns: 80,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 1,
  });

  assert.ok(withAgreement.confidence > noAgreement.confidence);
  assert.ok(withAgreement.confidence <= 0.62);
  assert.ok(withAgreement.blockers.includes("narrative_judge_confidence_sample_missing"));
});

test("missing narrative raw confidence with low judge agreement remains bounded", () => {
  const diverged = buildProductQualityScorecard({
    runs: 20,
    turns: 80,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1400,
    p95LatencyMs: 2400,
    narrativeScore5: 4.5,
    narrativeJudgeConfidence: 0.9,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.7,
    agencyResponseRate: 0.98,
    meaningfulChoiceRate: null,
    structuredConsequenceRate: 0.9,
    deadTurnRate: 0.01,
    tokenInput: 5_000,
    tokenOutput: 1_000,
    tokenCostEquivalent: 700,
    tokenCostProfile: "test",
    tokenCoveredTurns: 20,
    tokenCoverageRate: 1,
    judgePassRate: 1,
    judgePassRuns: 20,
    judgePassAgreementRate: 0.3,
    judgeCodexAgreementRate: 0.2,
  });
  const consistent = buildProductQualityScorecard({
    runs: 20,
    turns: 80,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1400,
    p95LatencyMs: 2400,
    narrativeScore5: 4.5,
    narrativeJudgeConfidence: 0.9,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.7,
    agencyResponseRate: 0.98,
    meaningfulChoiceRate: null,
    structuredConsequenceRate: 0.9,
    deadTurnRate: 0.01,
    tokenInput: 5_000,
    tokenOutput: 1_000,
    tokenCostEquivalent: 700,
    tokenCostProfile: "test",
    tokenCoveredTurns: 20,
    tokenCoverageRate: 1,
    judgePassRate: 1,
    judgePassRuns: 20,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 1,
  });

  assert.ok(diverged.blockers.includes("narrative_judge_confidence_sample_missing"));
  assert.ok(diverged.confidence < consistent.confidence);
  assert.ok(diverged.confidence < 0.62);
});

test("absence of raw judge confidence applies hard upper cap on no-raw confidence", () => {
  const base = buildProductQualityScorecard({
    runs: 120,
    turns: 300,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1200,
    p95LatencyMs: 1800,
    narrativeScore5: 4.8,
    narrativeJudgeConfidence: 0.95,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.85,
    agencyResponseRate: 1,
    meaningfulChoiceRate: null,
    structuredConsequenceRate: 0.95,
    deadTurnRate: 0.01,
    tokenInput: 1000,
    tokenOutput: 100,
    tokenCostEquivalent: 800,
    tokenCostProfile: "test",
    tokenCoveredTurns: 120,
    tokenCoverageRate: 1,
    judgePassRate: 0.99,
    judgePassRuns: 60,
    judgePassAgreementRate: 1,
    judgeCodexAgreementRate: 1,
  });

  assert.ok(base.confidence <= 0.72 + 1e-9);
  assert.equal(base.confidenceTrace.source, "judge_coverage_inferred");
  assert.equal(base.confidenceTrace.rawEvidenceUsed, false);
});

test("confidence trace exposes no-pseudo confidence path", () => {
  const rawMissingSignals = {
    runs: 30,
    turns: 150,
    passRate: 1,
    softlockRate: 0,
    errorRate: 0,
    p50LatencyMs: 1200,
    p95LatencyMs: 2500,
    narrativeScore5: 4.8,
    narrativeJudgeConfidence: 0.9,
    repetitionRate: 0,
    worldConsistencyIssueTurnRate: 0,
    progressionTurnRate: 0.7,
    agencyResponseRate: 0.95,
    meaningfulChoiceRate: 0.9,
    structuredConsequenceRate: 0.9,
    deadTurnRate: 0.01,
    tokenInput: 10000,
    tokenOutput: 1000,
    tokenCostEquivalent: 1000,
    tokenCostProfile: "test",
    tokenCoveredTurns: 150,
    tokenCoverageRate: 1,
    judgePassRate: 0.98,
    judgePassRuns: 30,
    judgePassAgreementRate: 0.9,
    judgeCodexAgreementRate: 0.95,
  } as const;
  const rawMissing = buildProductQualityScorecard(rawMissingSignals);

  assert.equal(rawMissing.confidenceTrace.source, "judge_coverage_inferred");
  assert.equal(rawMissing.confidenceTrace.rawEvidenceUsed, false);
  assert.ok(rawMissing.confidenceTrace.confidencePathPenaltyReason.includes("缺少原始AI/Codex置信输出，采用保守推断路径"));
  assert.ok(rawMissing.confidence < 0.62);

  const withRaw = buildProductQualityScorecard({
    ...rawMissingSignals,
    narrativeJudgeConfidenceRaw: 0.92,
    narrativeJudgeConfidenceSampleCount: 50,
    narrativeJudgeConfidenceCoverage: 0.8,
    trustedNarrativeJudgeConfidenceCoverage: 0.8,
    narrativeJudgeConfidenceTrustedSampleCount: 40,
    narrativeJudgeConfidence: 0.9,
  });
  assert.equal(withRaw.confidenceTrace.source, "raw_ai");
  assert.equal(withRaw.confidenceTrace.rawEvidenceUsed, true);
});
