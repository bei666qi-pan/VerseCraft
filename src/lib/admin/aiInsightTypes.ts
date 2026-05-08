export type AiInsightInput = {
  range: { preset: string; startDateKey: string; endDateKey: string; label: string };
  metrics: { overview: Record<string, unknown>; retention: Record<string, unknown>; funnel: Record<string, unknown>; realtime: Record<string, unknown> };
  feedback: { totalFeedback: number; negativeFeedback: number; negativeRate: number; topTopics: Array<{ topic: string; count: number }>; samples: string[] };
  survey: {
    sampleSize: number;
    registeredResponses: number;
    guestResponses: number;
    avgOverallRating: number | null;
    avgRecommendScore: number | null;
    contactIntentCount: number;
    recentSamples: Array<{ actorKind: "注册用户" | "游客" | "未知"; overallRating: number | null; recommendScore: number | null; comment: string }>;
  };
  contentQuality: {
    sampleSize: number;
    worldFirstActionRate: number;
    chapterCompletionRate: number;
    chapterAbandonRate: number;
    npcInteractionCompletionRate: number;
    retryRegenerationCount: number;
    validatorIssueTotal: number;
    topWorlds: Array<{ worldId: string; count: number; firstActionRate: number }>;
    topChapters: Array<{ chapterId: string; entered: number; completionRate: number; abandonRate: number }>;
    topNpcs: Array<{ npcId: string; started: number; completionRate: number; failureRate: number }>;
    topValidatorIssues: Array<{ code: string; count: number }>;
  };
  eventHealth: {
    totalEvents: number;
    invalidContractCount: number;
    missingActorCount: number;
    missingGuestCount: number;
    anonSessionCount: number;
    unknownPlatformCount: number;
    evidenceSufficiency: "enough" | "insufficient";
    rates: {
      invalidContractRate: number;
      missingActorRate: number;
      missingGuestRate: number;
      anonSessionRate: number;
      unknownPlatformRate: number;
    };
    topMissingProperties: Array<{ property: string; count: number }>;
    eventCoverage: Array<{ eventName: string; count: number; covered: boolean }>;
  };
  strictPlayerJourney: {
    sampleSize: number;
    evidenceSufficiency: "enough" | "insufficient";
    biggestDrop: { from: string; to: string; dropOffCount: number; dropOffRate: number } | null;
    stages: Array<{ eventName: string; label: string; count: number; stepConversionRate: number; totalConversionRate: number; dropOffCount: number; dropOffRate: number }>;
  };
  surveyThemes: {
    sampleSize: number;
    evidenceSufficiency: "enough" | "insufficient";
    topThemes: Array<{ theme: string; count: number; pct: number }>;
    lowRatingSamples: Array<{ overallRating: number | null; recommendScore: number | null; experienceStage: string; summary: string }>;
  };
  userRiskSummary: {
    highAiCostActors: number;
    waitTooLongActors: number;
    negativeFeedbackActors: number;
    negativeSurveyResponses: number;
    saveAnxietyResponses: number;
    contentQualityRiskSignals: number;
    topRiskTags: Array<{ tag: string; count: number }>;
  };
  anomalyHints: string[];
  evidenceQuality: "enough" | "insufficient";
};

export type AiInsightOutput = {
  executiveSummary: string;
  recommendations: Array<{
    priority: "immediate" | "this_week" | "mid_term";
    title: string;
    claim: string;
    evidenceMetrics: Array<{ metricId: string; label: string; value: string; source: string }>;
    sampleSize: number;
    confidence: "high" | "medium" | "low";
    risk: string;
    suggestedExperiment: string;
    expectedImpact: string;
    nextAction: string;
  }>;
  retentionRisks: Array<{ priority: "immediate" | "this_week" | "mid_term"; title: string; detail: string; evidence: string }>;
  productProblems: Array<{ priority: "immediate" | "this_week" | "mid_term"; title: string; detail: string; evidence: string }>;
  opportunityPoints: Array<{ priority: "immediate" | "this_week" | "mid_term"; title: string; detail: string; evidence: string }>;
  top3Actions: Array<{ priority: "immediate" | "this_week" | "mid_term"; action: string; why: string; expectedImpact: string }>;
  expectedImpact: { retentionLift?: string; tokenCostChange?: string; confidenceNote: string };
  confidence: { score: number; level: "high" | "medium" | "low"; reason: string };
  evidence: Array<{ metric: string; value: string; source: string }>;
  suggestedExperiments: Array<{ name: string; hypothesis: string; metric: string; duration: string }>;
  generatedAt: string;
  evidenceSufficiency: "enough" | "insufficient";
};
