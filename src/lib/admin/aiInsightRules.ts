import { validateAiInsightOutput } from "@/lib/admin/aiInsightSchema";
import type { AiInsightInput, AiInsightOutput } from "@/lib/admin/aiInsightTypes";

function rateLabel(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function eventHealthTrustReason(eventHealth: AiInsightInput["eventHealth"]): string | null {
  if (eventHealth.evidenceSufficiency === "insufficient") return "event_health_insufficient_sample";
  if (eventHealth.rates.invalidContractRate > 0.1) return "event_health_invalid_contract_high";
  if (eventHealth.rates.missingActorRate > 0.1) return "event_health_missing_actor_high";
  if (eventHealth.rates.anonSessionRate > 0.1) return "event_health_anon_session_high";
  if (eventHealth.rates.unknownPlatformRate > 0.35) return "event_health_unknown_platform_high";
  return null;
}

export function computeAiEvidenceQuality(input: {
  eventHealth: AiInsightInput["eventHealth"];
  strictPlayerJourney: Pick<AiInsightInput["strictPlayerJourney"], "sampleSize">;
  surveyThemes: Pick<AiInsightInput["surveyThemes"], "sampleSize">;
  contentQuality: Pick<AiInsightInput["contentQuality"], "sampleSize">;
  feedback: Pick<AiInsightInput["feedback"], "totalFeedback">;
  activeUsers: number;
}): { quality: "enough" | "insufficient"; reasons: string[]; surveyOnlyDirectional: boolean } {
  const reasons: string[] = [];
  const eventHealthReason = eventHealthTrustReason(input.eventHealth);
  if (eventHealthReason) reasons.push(eventHealthReason);
  if (input.strictPlayerJourney.sampleSize < 20) reasons.push("journey_sample_below_20");
  if (input.activeUsers < 20) reasons.push("active_actor_sample_below_20");
  if (Math.max(input.feedback.totalFeedback, input.surveyThemes.sampleSize, input.contentQuality.sampleSize) < 10) reasons.push("feedback_survey_content_sample_below_10");
  return {
    quality: reasons.length > 0 ? "insufficient" : "enough",
    reasons,
    surveyOnlyDirectional: input.surveyThemes.sampleSize < 10,
  };
}

export function emptyEventHealth(): AiInsightInput["eventHealth"] {
  return {
    totalEvents: 0,
    invalidContractCount: 0,
    missingActorCount: 0,
    missingGuestCount: 0,
    anonSessionCount: 0,
    unknownPlatformCount: 0,
    evidenceSufficiency: "insufficient",
    rates: {
      invalidContractRate: 0,
      missingActorRate: 0,
      missingGuestRate: 0,
      anonSessionRate: 0,
      unknownPlatformRate: 0,
    },
    topMissingProperties: [],
    eventCoverage: [],
  };
}

export function emptyStrictJourney(): AiInsightInput["strictPlayerJourney"] {
  return {
    sampleSize: 0,
    evidenceSufficiency: "insufficient",
    biggestDrop: null,
    stages: [],
  };
}

export function fallbackFromInput(input: AiInsightInput): AiInsightOutput {
  const activeUsers = Number((input.metrics.overview as { activeUsersRange?: number }).activeUsersRange ?? 0);
  const feedbackSample = Number(input.feedback.totalFeedback ?? 0);
  const surveySample = Number(input.survey.sampleSize ?? 0);
  const eventHealth = input.eventHealth ?? emptyEventHealth();
  const strictPlayerJourney = input.strictPlayerJourney ?? emptyStrictJourney();
  const surveyThemes = input.surveyThemes ?? { sampleSize: 0, evidenceSufficiency: "insufficient" as const, topThemes: [], lowRatingSamples: [] };
  const journeySample = Number(strictPlayerJourney.sampleSize ?? 0);
  const contentSample = Number(input.contentQuality.sampleSize ?? 0);
  const eventSample = Number(eventHealth.totalEvents ?? 0);
  const sampleSize = Math.max(activeUsers, feedbackSample, surveySample, journeySample, contentSample, eventSample);
  const insufficient = input.evidenceQuality === "insufficient";
  const surveyNote = surveyThemes.sampleSize < 10 ? "问卷样本小于10，只能作为方向参考。" : "";
  const recommendations: AiInsightOutput["recommendations"] = [];
  if (insufficient) {
    recommendations.push({
      priority: "immediate",
      title: "证据不足，先补齐关键采样",
      claim: "当前事件健康或关键漏斗样本不足，不应输出高置信增长建议。",
      evidenceMetrics: [
        { metricId: "event_health.total_events", label: "事件样本", value: String(eventSample), source: "analytics_events" },
        { metricId: "journey.strict.sample_size", label: "严格漏斗样本", value: String(journeySample), source: "analytics_events" },
        { metricId: "survey.sample_size", label: "问卷样本", value: String(surveySample), source: "survey_responses" },
      ],
      sampleSize,
      confidence: "low",
      risk: "在身份或漏斗采样不可信时直接改玩法，可能误判真实流失原因。",
      suggestedExperiment: "先修复缺 actor、anon_session、unknown platform 和关键漏斗缺口，再做产品实验。",
      expectedImpact: "提高后续运营分析可信度，减少错误决策。",
      nextAction: "打开数据质量与玩家旅程 tab，优先处理缺失率最高的字段。",
    });
  } else {
    const drop = strictPlayerJourney.biggestDrop;
    recommendations.push({
      priority: "this_week",
      title: drop ? `验证 ${drop.from} 到 ${drop.to} 的最大流失` : "验证新手首行动引导",
      claim: drop
        ? `严格顺序漏斗显示该区间流失 ${drop.dropOffCount} 人，流失率 ${rateLabel(drop.dropOffRate)}。`
        : "当前事件健康可信，可以围绕首行动与内容路径做小流量实验。",
      evidenceMetrics: [
        { metricId: "journey.strict.sample_size", label: "严格漏斗样本", value: String(journeySample), source: "analytics_events" },
        { metricId: "journey.strict.biggest_drop", label: "最大流失", value: drop ? `${drop.dropOffCount} / ${rateLabel(drop.dropOffRate)}` : "暂无明显区间", source: "analytics_events" },
        { metricId: "event_health.invalid_contract_rate", label: "事件契约异常率", value: rateLabel(eventHealth.rates.invalidContractRate), source: "analytics_events" },
      ],
      sampleSize,
      confidence: "medium",
      risk: "只改一个新手节点；不要同时改变世界入口、角色创建和首行动。",
      suggestedExperiment: "对最大流失区间增加一版更明确的下一步提示，观察严格漏斗 stepConversionRate。",
      expectedImpact: "提升首行动或下一关键阶段抵达率。",
      nextAction: "用 strict 漏斗定位最大流失 actor，再抽看 5 个用户详情。",
    });
  }

  if (!insufficient && (input.contentQuality.validatorIssueTotal > 0 || input.contentQuality.retryRegenerationCount > 0)) {
    recommendations.push({
      priority: "this_week",
      title: "降低重试和规则冲突",
      claim: `内容质量样本中有 ${input.contentQuality.validatorIssueTotal} 个 validator issue，重试/重新生成 ${input.contentQuality.retryRegenerationCount} 次。`,
      evidenceMetrics: [
        { metricId: "content.validator_issue.total", label: "规则冲突", value: String(input.contentQuality.validatorIssueTotal), source: "analytics_events" },
        { metricId: "content.retry_or_regen.count", label: "重试/重新生成", value: String(input.contentQuality.retryRegenerationCount), source: "analytics_events" },
      ],
      sampleSize: contentSample,
      confidence: contentSample >= 20 ? "medium" : "low",
      risk: "先定位高频 code，不要用大 prompt 覆盖所有问题。",
      suggestedExperiment: "针对最高频 validator code 补一个窄 validator 或 prompt packet，而不是全局改写。",
      expectedImpact: "降低玩家重试和内容不稳定感。",
      nextAction: "查看内容质量 tab 的 validator issue 分类。",
    });
  }

  if (!insufficient && surveyThemes.topThemes[0]) {
    const theme = surveyThemes.topThemes[0];
    recommendations.push({
      priority: "mid_term",
      title: `围绕“${theme.theme}”做定向修复`,
      claim: `问卷开放文本主题中“${theme.theme}”出现 ${theme.count} 次，占 ${theme.pct}%。${surveyNote}`,
      evidenceMetrics: [
        { metricId: "survey.text_themes.top", label: "最高频问卷主题", value: `${theme.theme} ${theme.count}`, source: "survey_responses" },
        { metricId: "survey.sample_size", label: "问卷样本", value: String(surveyThemes.sampleSize), source: "survey_responses" },
      ],
      sampleSize: surveyThemes.sampleSize,
      confidence: surveyThemes.sampleSize >= 10 ? "medium" : "low",
      risk: "开放文本是方向证据，不应用来单独证明增长。",
      suggestedExperiment: "把该主题拆成一个可观测修复点，配合漏斗或重试指标验证。",
      expectedImpact: "降低对应抱怨主题占比。",
      nextAction: "查看问卷分析 tab 的低评分样本摘要。",
    });
  }

  return {
    executiveSummary: insufficient
      ? "证据不足：当前事件健康或关键漏斗样本不足，只建议补采和核查，不输出高置信增长策略。"
      : `证据可用：事件健康、严格漏斗、内容质量和问卷主题已纳入。本地规则建议先处理可验证的最大流失点。${surveyNote}`,
    recommendations: recommendations.slice(0, 3),
    retentionRisks: [],
    productProblems: [],
    opportunityPoints: [],
    top3Actions: [],
    expectedImpact: { confidenceNote: insufficient ? "模型调用失败或证据不足，使用本地补采建议。" : "模型调用失败，使用本地规则建议；置信度最高为中。" },
    confidence: { score: insufficient ? 0.25 : 0.55, level: insufficient ? "low" : "medium", reason: insufficient ? "事件健康或样本不足" : "本地规则兜底，证据可追溯但未由模型综合" },
    evidence: [
      { metric: "activeUsersRange", value: String(activeUsers), source: "admin_metrics_daily" },
      { metric: "eventHealthInvalidRate", value: rateLabel(eventHealth.rates.invalidContractRate), source: "analytics_events" },
      { metric: "strictJourneySample", value: String(journeySample), source: "analytics_events" },
      { metric: "negativeRate", value: `${(input.feedback.negativeRate * 100).toFixed(1)}%`, source: "feedbacks" },
      { metric: "surveySample", value: String(surveySample), source: "survey_responses" },
    ],
    suggestedExperiments: [],
    generatedAt: new Date().toISOString(),
    evidenceSufficiency: input.evidenceQuality,
  };
}

export function validateOrFallbackAiInsightOutput(raw: unknown, input: AiInsightInput): AiInsightOutput | null {
  const parsed = validateAiInsightOutput(raw);
  if (!parsed) return null;
  const eventHealth = input.eventHealth ?? emptyEventHealth();
  const strictPlayerJourney = input.strictPlayerJourney ?? emptyStrictJourney();
  const surveyThemes = input.surveyThemes ?? { sampleSize: 0, evidenceSufficiency: "insufficient" as const, topThemes: [], lowRatingSamples: [] };
  const inputInsufficient = input.evidenceQuality === "insufficient" || strictPlayerJourney.sampleSize < 20 || Boolean(eventHealthTrustReason(eventHealth));
  if (inputInsufficient) {
    if (parsed.evidenceSufficiency === "enough") return null;
    if (parsed.confidence.level === "high" || parsed.recommendations.some((item) => item.confidence === "high")) return null;
  }
  if (surveyThemes.sampleSize < 10) {
    const highSurveyOnly = parsed.recommendations.some((item) => item.confidence === "high" && item.evidenceMetrics.every((metric) => String(metric.metricId).startsWith("survey.")));
    if (highSurveyOnly) return null;
  }
  return parsed;
}
