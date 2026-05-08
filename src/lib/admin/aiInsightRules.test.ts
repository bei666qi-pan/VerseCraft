import test from "node:test";
import assert from "node:assert/strict";
import { computeAiEvidenceQuality, fallbackFromInput, validateOrFallbackAiInsightOutput } from "@/lib/admin/aiInsightRules";
import { validateAiInsightOutput } from "@/lib/admin/aiInsightSchema";
import type { AiInsightInput, AiInsightOutput } from "@/lib/admin/aiInsightTypes";

function baseInput(overrides: Partial<AiInsightInput> = {}): AiInsightInput {
  const input: AiInsightInput = {
    range: { preset: "7d", startDateKey: "2026-05-01", endDateKey: "2026-05-07", label: "最近7天" },
    metrics: {
      overview: { activeUsersRange: 50, tokenCostRange: 12000 },
      retention: {},
      funnel: {},
      realtime: {},
    },
    feedback: { totalFeedback: 20, negativeFeedback: 3, negativeRate: 0.15, topTopics: [], samples: [] },
    survey: {
      sampleSize: 12,
      registeredResponses: 5,
      guestResponses: 7,
      avgOverallRating: 3.5,
      avgRecommendScore: 6,
      contactIntentCount: 1,
      recentSamples: [],
    },
    contentQuality: {
      sampleSize: 30,
      worldFirstActionRate: 0.7,
      chapterCompletionRate: 0.5,
      chapterAbandonRate: 0.1,
      npcInteractionCompletionRate: 0.8,
      retryRegenerationCount: 2,
      validatorIssueTotal: 1,
      topWorlds: [],
      topChapters: [],
      topNpcs: [],
      topValidatorIssues: [],
    },
    eventHealth: {
      totalEvents: 100,
      invalidContractCount: 1,
      missingActorCount: 1,
      missingGuestCount: 1,
      anonSessionCount: 0,
      unknownPlatformCount: 5,
      evidenceSufficiency: "enough",
      rates: {
        invalidContractRate: 0.01,
        missingActorRate: 0.01,
        missingGuestRate: 0.01,
        anonSessionRate: 0,
        unknownPlatformRate: 0.05,
      },
      topMissingProperties: [],
      eventCoverage: [],
    },
    strictPlayerJourney: {
      sampleSize: 50,
      evidenceSufficiency: "enough",
      biggestDrop: { from: "首页曝光", to: "世界观选择", dropOffCount: 8, dropOffRate: 0.16 },
      stages: [],
    },
    surveyThemes: {
      sampleSize: 12,
      evidenceSufficiency: "enough",
      topThemes: [{ theme: "等待太久", count: 4, pct: 33.3 }],
      lowRatingSamples: [],
    },
    userRiskSummary: {
      highAiCostActors: 1,
      waitTooLongActors: 2,
      negativeFeedbackActors: 1,
      negativeSurveyResponses: 2,
      saveAnxietyResponses: 0,
      contentQualityRiskSignals: 3,
      topRiskTags: [],
    },
    anomalyHints: [],
    evidenceQuality: "enough",
  };
  return { ...input, ...overrides };
}

function validOutput(overrides: Partial<AiInsightOutput> = {}): AiInsightOutput {
  const output: AiInsightOutput = {
    executiveSummary: "ok",
    recommendations: [
      {
        priority: "this_week",
        title: "t",
        claim: "c",
        evidenceMetrics: [{ metricId: "journey.strict.sample_size", label: "样本", value: "50", source: "analytics_events" }],
        sampleSize: 50,
        confidence: "medium",
        risk: "r",
        suggestedExperiment: "e",
        expectedImpact: "i",
        nextAction: "n",
      },
    ],
    retentionRisks: [],
    productProblems: [],
    opportunityPoints: [],
    top3Actions: [],
    expectedImpact: { confidenceNote: "c" },
    confidence: { score: 0.5, level: "medium", reason: "r" },
    evidence: [{ metric: "m", value: "v", source: "s" }],
    suggestedExperiments: [],
    generatedAt: new Date().toISOString(),
    evidenceSufficiency: "enough",
  };
  return { ...output, ...overrides };
}

test("sample-insufficient fallback recommends collection and never high confidence", () => {
  const input = baseInput({
    evidenceQuality: "insufficient",
    eventHealth: { ...baseInput().eventHealth, totalEvents: 5, evidenceSufficiency: "insufficient" },
    strictPlayerJourney: { ...baseInput().strictPlayerJourney, sampleSize: 8, evidenceSufficiency: "insufficient" },
  });
  const output = fallbackFromInput(input);
  assert.equal(output.evidenceSufficiency, "insufficient");
  assert.equal(output.confidence.level, "low");
  assert.equal(output.recommendations[0]?.confidence, "low");
  assert.match(output.recommendations[0]?.claim ?? "", /不应输出高置信/);
  assert.ok(validateAiInsightOutput(output));
});

test("schema-invalid AI output falls back through validation", () => {
  const input = baseInput();
  const invalid = validOutput({
    recommendations: [
      {
        ...validOutput().recommendations[0]!,
        evidenceMetrics: [{ metricId: "m", label: "M", value: "1", source: 1 as unknown as string }],
      },
    ],
  });
  assert.equal(validateOrFallbackAiInsightOutput(invalid, input), null);
  assert.ok(validateAiInsightOutput(fallbackFromInput(input)));
});

test("bad event health degrades evidence and rejects high-confidence AI output", () => {
  const eventHealth = { ...baseInput().eventHealth, rates: { ...baseInput().eventHealth.rates, missingActorRate: 0.3 } };
  const evidence = computeAiEvidenceQuality({
    eventHealth,
    strictPlayerJourney: { sampleSize: 50 },
    surveyThemes: { sampleSize: 12 },
    contentQuality: { sampleSize: 30 },
    feedback: { totalFeedback: 20 },
    activeUsers: 50,
  });
  assert.equal(evidence.quality, "insufficient");
  const input = baseInput({ eventHealth, evidenceQuality: "insufficient" });
  const high = validOutput({
    evidenceSufficiency: "insufficient",
    confidence: { score: 0.8, level: "high", reason: "bad" },
    recommendations: [{ ...validOutput().recommendations[0]!, confidence: "high" }],
  });
  assert.equal(validateOrFallbackAiInsightOutput(high, input), null);
});

test("AI-unavailable local fallback still returns traceable evidence metrics", () => {
  const output = fallbackFromInput(baseInput());
  assert.equal(output.evidenceSufficiency, "enough");
  assert.notEqual(output.confidence.level, "high");
  assert.ok(output.recommendations.length > 0);
  assert.ok(output.recommendations.every((item) => item.evidenceMetrics.length > 0));
});
