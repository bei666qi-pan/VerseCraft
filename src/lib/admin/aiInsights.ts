import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { runBackofficeReasonerJsonTask } from "@/lib/ai/logicalTasks";
import { createRequestId } from "@/lib/security/helpers";
import type { AdminTimeRange } from "@/lib/admin/timeRange";
import { getContentQualityMetrics, getPlayerJourneyMetrics } from "@/lib/admin/backofficeMetrics";
import { getEventHealthMetrics } from "@/lib/admin/eventHealthMetrics";
import { getFeedbackInsights, getFunnelMetrics, getOverviewMetrics, getRealtimeMetrics, getRetentionMetrics, getSurveyAggregate } from "@/lib/admin/service";
import { computeAiEvidenceQuality, emptyEventHealth, emptyStrictJourney, fallbackFromInput, validateOrFallbackAiInsightOutput } from "@/lib/admin/aiInsightRules";
import type { AiInsightInput, AiInsightOutput } from "@/lib/admin/aiInsightTypes";
import { readLatestAiAnalysisSnapshot, upsertAiAnalysisSnapshot } from "@/lib/ai/analysis/snapshotStore";

export type { AiInsightInput, AiInsightOutput };

const ADMIN_ANALYSIS_TTL_MS = 15 * 60 * 1000;

function buildAdminScopeKey(range: AdminTimeRange): string {
  return `range:${range.preset}:${range.startDateKey}:${range.endDateKey}`;
}

function buildAdminDataRevision(input: AiInsightInput): string {
  const m = input.metrics.overview as { activeUsersRange?: number; tokenCostRange?: number };
  return [
    input.range.startDateKey,
    input.range.endDateKey,
    String(m.activeUsersRange ?? 0),
    String(m.tokenCostRange ?? 0),
    String(input.feedback.totalFeedback),
    String(input.feedback.negativeFeedback),
    String(input.survey.sampleSize),
    String(input.survey.avgOverallRating ?? ""),
    String(input.contentQuality.retryRegenerationCount),
    String(input.contentQuality.validatorIssueTotal),
    String(input.eventHealth.invalidContractCount),
    String(input.strictPlayerJourney.sampleSize),
    String(input.userRiskSummary.highAiCostActors),
  ].join("|");
}

function cleanFeedbackText(input: string): string {
  return input.replace(/\s+/g, " ").replace(/[^\u4e00-\u9fa5a-zA-Z0-9,.;:!?()\-\s]/g, "").trim().slice(0, 200);
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function finiteNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function finiteNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isAiInsightInputCurrent(input: unknown): input is AiInsightInput {
  if (!input || typeof input !== "object") return false;
  const x = input as Partial<AiInsightInput>;
  return Boolean(x.eventHealth && x.strictPlayerJourney && x.contentQuality && x.surveyThemes && x.userRiskSummary && x.metrics && x.feedback && x.survey);
}

async function getSurveyEvidence(range: AdminTimeRange): Promise<AiInsightInput["survey"]> {
  const [aggRaw, recentRaw] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS "sampleSize",
        COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int AS "registeredResponses",
        COUNT(*) FILTER (WHERE user_id IS NULL AND guest_id IS NOT NULL AND btrim(guest_id::text) <> '')::int AS "guestResponses",
        AVG(overall_rating)::float AS "avgOverallRating",
        AVG(recommend_score)::float AS "avgRecommendScore",
        COUNT(*) FILTER (WHERE contact_intent = true)::int AS "contactIntentCount"
      FROM survey_responses
      WHERE created_at >= ${range.start}
        AND created_at <= ${range.end}
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT
        CASE
          WHEN user_id IS NOT NULL THEN '注册用户'
          WHEN guest_id IS NOT NULL AND btrim(guest_id::text) <> '' THEN '游客'
          ELSE '未知'
        END AS "actorKind",
        overall_rating AS "overallRating",
        recommend_score AS "recommendScore",
        free_text AS "freeText"
      FROM survey_responses
      WHERE created_at >= ${range.start}
        AND created_at <= ${range.end}
      ORDER BY created_at DESC
      LIMIT 12
    `).catch(() => ({ rows: [] })),
  ]);
  const agg = rowsOf(aggRaw)[0] ?? {};
  return {
    sampleSize: Number(agg.sampleSize ?? 0),
    registeredResponses: Number(agg.registeredResponses ?? 0),
    guestResponses: Number(agg.guestResponses ?? 0),
    avgOverallRating: finiteNumberOrNull(agg.avgOverallRating),
    avgRecommendScore: finiteNumberOrNull(agg.avgRecommendScore),
    contactIntentCount: Number(agg.contactIntentCount ?? 0),
    recentSamples: rowsOf(recentRaw).map((r) => ({
      actorKind: String(r.actorKind ?? "未知") === "注册用户" ? "注册用户" : String(r.actorKind ?? "未知") === "游客" ? "游客" : "未知",
      overallRating: finiteNumberOrNull(r.overallRating),
      recommendScore: finiteNumberOrNull(r.recommendScore),
      comment: cleanFeedbackText(String(r.freeText ?? "")),
    })),
  };
}

async function getUserRiskSummaryEvidence(range: AdminTimeRange): Promise<AiInsightInput["userRiskSummary"]> {
  const [aiRaw, feedbackRaw, surveyRaw] = await Promise.all([
    db.execute(sql`
      WITH actor_chat AS (
        SELECT
          COALESCE(
            actor_id,
            CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id END,
            CASE WHEN guest_id IS NOT NULL AND btrim(guest_id::text) <> '' THEN 'g:' || guest_id END,
            session_id
          ) AS actor_key,
          COALESCE(SUM(token_cost), 0)::int AS token_cost,
          COUNT(*) FILTER (
            WHERE payload->>'totalLatencyMs' ~ '^[0-9]+(\\.[0-9]+)?$'
              AND (payload->>'totalLatencyMs')::numeric >= 18000
          )::int AS slow_requests
        FROM analytics_events
        WHERE event_name = 'chat_request_finished'
          AND event_time >= ${range.start}
          AND event_time <= ${range.end}
        GROUP BY actor_key
      )
      SELECT
        COUNT(*) FILTER (WHERE token_cost >= 50000)::int AS "highAiCostActors",
        COUNT(*) FILTER (WHERE slow_requests > 0)::int AS "waitTooLongActors"
      FROM actor_chat
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT COUNT(DISTINCT COALESCE(user_id, guest_id, id::text))::int AS "negativeFeedbackActors"
      FROM feedbacks
      WHERE created_at >= ${range.start}
        AND created_at <= ${range.end}
        AND (
          kind ~* '(negative|bug|complaint|risk|bad|fail)'
          OR content ~ '(慢|等|卡|失败|不好|看不懂|不知道|崩|丢|存档|难用|失望|不稳定)'
        )
    `).catch(() => ({ rows: [] })),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(overall_rating, 99) <= 2
             OR COALESCE(recommend_score, 99) <= 4
             OR answers->>'recommendWillingness' = 'unwilling'
        )::int AS "negativeSurveyResponses",
        COUNT(*) FILTER (
          WHERE answers->>'saveLossConcern' IN ('quite_worried_frequent_check', 'very_worried_affects_continue', 'already_lost_or_cannot_find')
             OR answers->>'quitReason' = 'save_progress_insecure'
        )::int AS "saveAnxietyResponses"
      FROM survey_responses
      WHERE created_at >= ${range.start}
        AND created_at <= ${range.end}
    `).catch(() => ({ rows: [] })),
  ]);
  const ai = rowsOf(aiRaw)[0] ?? {};
  const feedback = rowsOf(feedbackRaw)[0] ?? {};
  const survey = rowsOf(surveyRaw)[0] ?? {};
  const highAiCostActors = finiteNumber(ai.highAiCostActors);
  const waitTooLongActors = finiteNumber(ai.waitTooLongActors);
  const negativeFeedbackActors = finiteNumber(feedback.negativeFeedbackActors);
  const negativeSurveyResponses = finiteNumber(survey.negativeSurveyResponses);
  const saveAnxietyResponses = finiteNumber(survey.saveAnxietyResponses);
  const topRiskTags = [
    { tag: "high_ai_cost", count: highAiCostActors },
    { tag: "wait_too_long", count: waitTooLongActors },
    { tag: "feedback_negative", count: negativeFeedbackActors },
    { tag: "survey_negative", count: negativeSurveyResponses },
    { tag: "save_anxiety", count: saveAnxietyResponses },
  ].filter((item) => item.count > 0).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return {
    highAiCostActors,
    waitTooLongActors,
    negativeFeedbackActors,
    negativeSurveyResponses,
    saveAnxietyResponses,
    contentQualityRiskSignals: 0,
    topRiskTags,
  };
}

export async function buildAiInsightInput(range: AdminTimeRange): Promise<AiInsightInput> {
  const [overview, retention, funnel, feedback, realtime, survey, contentQuality, eventHealthRaw, strictJourneyRaw, surveyAggregateRaw, userRiskSummaryRaw] = await Promise.all([
    getOverviewMetrics(range),
    getRetentionMetrics(range),
    getFunnelMetrics(range),
    getFeedbackInsights(range),
    getRealtimeMetrics(),
    getSurveyEvidence(range),
    getContentQualityMetrics(range).catch(() => null),
    getEventHealthMetrics(range, { limit: 20 }).catch(() => null),
    getPlayerJourneyMetrics(range, { actorType: "all", platform: "all" }, "strict").catch(() => null),
    getSurveyAggregate(range).catch(() => null),
    getUserRiskSummaryEvidence(range).catch(() => null),
  ]);
  const negativeRate = feedback.totalFeedback > 0 ? feedback.negativeFeedback / feedback.totalFeedback : 0;
  const samples = (((feedback as unknown as { samples?: string[] }).samples) ?? []).map(cleanFeedbackText).filter(Boolean).slice(0, 12);
  const contentQualityEvidence: AiInsightInput["contentQuality"] = contentQuality
    ? {
        sampleSize: Number(contentQuality.sampleSize ?? 0),
        worldFirstActionRate: Number(contentQuality.worldFirstActionRate ?? 0),
        chapterCompletionRate: Number(contentQuality.chapters?.completionRate ?? 0),
        chapterAbandonRate: Number(contentQuality.chapters?.abandonRate ?? 0),
        npcInteractionCompletionRate: Number(contentQuality.npcInteractions?.completionRate ?? 0),
        retryRegenerationCount: Number(contentQuality.retryRegenerationCount ?? 0),
        validatorIssueTotal: Number(contentQuality.validatorIssues?.total ?? 0),
        topWorlds: (contentQuality.worldSelections ?? []).slice(0, 5).map((x) => ({
          worldId: String(x.worldId ?? "unknown"),
          count: Number(x.count ?? 0),
          firstActionRate: Number(x.firstActionRate ?? 0),
        })),
        topChapters: (contentQuality.chapters?.rank ?? []).slice(0, 5).map((x) => ({
          chapterId: String(x.chapterId ?? "unknown"),
          entered: Number(x.entered ?? 0),
          completionRate: Number(x.completionRate ?? 0),
          abandonRate: Number(x.abandonRate ?? 0),
        })),
        topNpcs: (contentQuality.npcInteractions?.rank ?? []).slice(0, 5).map((x) => ({
          npcId: String(x.npcId ?? "unknown"),
          started: Number(x.started ?? 0),
          completionRate: Number(x.completionRate ?? 0),
          failureRate: Number(x.failureRate ?? 0),
        })),
        topValidatorIssues: (contentQuality.validatorIssues?.byCode ?? []).slice(0, 8).map((x) => ({
          code: String(x.code ?? "unknown"),
          count: Number(x.count ?? 0),
        })),
      }
    : {
        sampleSize: 0,
        worldFirstActionRate: 0,
        chapterCompletionRate: 0,
        chapterAbandonRate: 0,
        npcInteractionCompletionRate: 0,
        retryRegenerationCount: 0,
        validatorIssueTotal: 0,
        topWorlds: [],
        topChapters: [],
        topNpcs: [],
        topValidatorIssues: [],
      };
  const eventHealth: AiInsightInput["eventHealth"] = eventHealthRaw
    ? {
        totalEvents: Number(eventHealthRaw.totalEvents ?? 0),
        invalidContractCount: Number(eventHealthRaw.invalidContractCount ?? 0),
        missingActorCount: Number(eventHealthRaw.missingActorCount ?? 0),
        missingGuestCount: Number(eventHealthRaw.missingGuestCount ?? 0),
        anonSessionCount: Number(eventHealthRaw.anonSessionCount ?? 0),
        unknownPlatformCount: Number(eventHealthRaw.unknownPlatformCount ?? 0),
        evidenceSufficiency: eventHealthRaw.evidenceSufficiency === "enough" ? "enough" : "insufficient",
        rates: {
          invalidContractRate: Number(eventHealthRaw.rates?.invalidContractRate ?? 0),
          missingActorRate: Number(eventHealthRaw.rates?.missingActorRate ?? 0),
          missingGuestRate: Number(eventHealthRaw.rates?.missingGuestRate ?? 0),
          anonSessionRate: Number(eventHealthRaw.rates?.anonSessionRate ?? 0),
          unknownPlatformRate: Number(eventHealthRaw.rates?.unknownPlatformRate ?? 0),
        },
        topMissingProperties: (eventHealthRaw.topMissingProperties ?? []).slice(0, 8).map((x) => ({
          property: String(x.property ?? "unknown"),
          count: Number(x.count ?? 0),
        })),
        eventCoverage: (eventHealthRaw.eventCoverage ?? []).map((x) => ({
          eventName: String(x.eventName ?? "unknown"),
          count: Number(x.count ?? 0),
          covered: Boolean(x.covered),
        })),
      }
    : emptyEventHealth();
  const strictPlayerJourney: AiInsightInput["strictPlayerJourney"] = strictJourneyRaw
    ? {
        sampleSize: Number(strictJourneyRaw.sampleSize ?? 0),
        evidenceSufficiency: strictJourneyRaw.evidenceSufficiency === "enough" ? "enough" : "insufficient",
        stages: (strictJourneyRaw.stages ?? []).map((s) => ({
          eventName: String(s.eventName ?? "unknown"),
          label: String(s.label ?? s.eventName ?? "unknown"),
          count: Number(s.count ?? 0),
          stepConversionRate: Number(s.stepConversionRate ?? 0),
          totalConversionRate: Number(s.totalConversionRate ?? 0),
          dropOffCount: Number(s.dropOffCount ?? 0),
          dropOffRate: Number(s.dropOffRate ?? 0),
        })),
        biggestDrop:
          (strictJourneyRaw.stages ?? []).filter((s) => Number(s.dropOffCount ?? 0) > 0).sort((a, b) => Number(b.dropOffCount ?? 0) - Number(a.dropOffCount ?? 0))[0]
            ? (() => {
                const stage = (strictJourneyRaw.stages ?? []).filter((s) => Number(s.dropOffCount ?? 0) > 0).sort((a, b) => Number(b.dropOffCount ?? 0) - Number(a.dropOffCount ?? 0))[0]!;
                const index = (strictJourneyRaw.stages ?? []).findIndex((s) => s.eventName === stage.eventName);
                const next = index >= 0 ? (strictJourneyRaw.stages ?? [])[index + 1] : null;
                return {
                  from: String(stage.label ?? stage.eventName ?? "unknown"),
                  to: String(next?.label ?? next?.eventName ?? "下一步"),
                  dropOffCount: Number(stage.dropOffCount ?? 0),
                  dropOffRate: Number(stage.dropOffRate ?? 0),
                };
              })()
            : null,
      }
    : emptyStrictJourney();
  const surveyThemes: AiInsightInput["surveyThemes"] = surveyAggregateRaw
    ? {
        sampleSize: Number(surveyAggregateRaw.totalResponses ?? 0),
        evidenceSufficiency: surveyAggregateRaw.evidenceSufficiency === "enough" ? "enough" : "insufficient",
        topThemes: (surveyAggregateRaw.textThemes ?? []).slice(0, 6).map((x) => ({
          theme: String(x.theme ?? "其他"),
          count: Number(x.count ?? 0),
          pct: Number(x.pct ?? 0),
        })),
        lowRatingSamples: (surveyAggregateRaw.lowRatingSamples ?? []).slice(0, 5).map((x) => ({
          overallRating: finiteNumberOrNull(x.overallRating),
          recommendScore: finiteNumberOrNull(x.recommendScore),
          experienceStage: String(x.experienceStage ?? "unknown"),
          summary: cleanFeedbackText(String(x.summary ?? "")),
        })),
      }
    : {
        sampleSize: 0,
        evidenceSufficiency: "insufficient",
        topThemes: [],
        lowRatingSamples: [],
      };
  const userRiskSummary: AiInsightInput["userRiskSummary"] = userRiskSummaryRaw
    ? {
        ...userRiskSummaryRaw,
        contentQualityRiskSignals: contentQualityEvidence.validatorIssueTotal + contentQualityEvidence.retryRegenerationCount,
        topRiskTags: [
          ...userRiskSummaryRaw.topRiskTags,
          { tag: "content_quality_risk", count: contentQualityEvidence.validatorIssueTotal + contentQualityEvidence.retryRegenerationCount },
        ].filter((item) => item.count > 0).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, 8),
      }
    : {
        highAiCostActors: 0,
        waitTooLongActors: 0,
        negativeFeedbackActors: 0,
        negativeSurveyResponses: 0,
        saveAnxietyResponses: 0,
        contentQualityRiskSignals: contentQualityEvidence.validatorIssueTotal + contentQualityEvidence.retryRegenerationCount,
        topRiskTags: [],
      };
  const anomalyHints: string[] = [];
  if ((retention.d1?.rate ?? 1) < 0.2) anomalyHints.push("D1留存低于20%");
  if ((realtime.trends?.eventsLast5m ?? 0) > (realtime.trends?.eventsLast15m ?? 0)) anomalyHints.push("近5分钟事件波动偏高");
  if (overview.cards.dau > 0 && overview.cards.todayTokenCost / overview.cards.dau > 5000) anomalyHints.push("人均Token成本偏高");
  if (contentQualityEvidence.retryRegenerationCount >= 10) anomalyHints.push("重试/重生成操作偏高");
  if (contentQualityEvidence.validatorIssueTotal >= 10) anomalyHints.push("叙事规则冲突样本偏高");
  const evidence = computeAiEvidenceQuality({
    eventHealth,
    strictPlayerJourney,
    surveyThemes,
    contentQuality: contentQualityEvidence,
    feedback: { totalFeedback: feedback.totalFeedback },
    activeUsers: Number(overview.cards.activeUsersRange ?? 0),
  });
  for (const reason of evidence.reasons) anomalyHints.push(reason);
  if (evidence.surveyOnlyDirectional) anomalyHints.push("问卷样本小于10，只能作为方向参考");
  return {
    range: { preset: range.preset, startDateKey: range.startDateKey, endDateKey: range.endDateKey, label: range.label },
    metrics: { overview: overview.cards, retention, funnel, realtime },
    feedback: { totalFeedback: feedback.totalFeedback, negativeFeedback: feedback.negativeFeedback, negativeRate, topTopics: feedback.topics.slice(0, 5), samples },
    survey,
    contentQuality: contentQualityEvidence,
    eventHealth,
    strictPlayerJourney,
    surveyThemes,
    userRiskSummary,
    anomalyHints,
    evidenceQuality: evidence.quality,
  };
}

export async function generateAiInsightReport(range: AdminTimeRange): Promise<{ input: AiInsightInput; output: AiInsightOutput; model: string; degraded: boolean }> {
  const input = await buildAiInsightInput(range);
  const requestId = createRequestId("admin_insight");

  const schemaHint = {
    executiveSummary: "string",
    recommendations: [
      {
        priority: "immediate|this_week|mid_term",
        title: "string",
        claim: "string",
        evidenceMetrics: [{ metricId: "string", label: "string", value: "string", source: "string" }],
        sampleSize: "number",
        confidence: "high|medium|low",
        risk: "string",
        suggestedExperiment: "string",
        expectedImpact: "string",
        nextAction: "string",
      },
    ],
    retentionRisks: [{ priority: "immediate|this_week|mid_term", title: "string", detail: "string", evidence: "string" }],
    productProblems: [{ priority: "immediate|this_week|mid_term", title: "string", detail: "string", evidence: "string" }],
    opportunityPoints: [{ priority: "immediate|this_week|mid_term", title: "string", detail: "string", evidence: "string" }],
    top3Actions: [{ priority: "immediate|this_week|mid_term", action: "string", why: "string", expectedImpact: "string" }],
    expectedImpact: { retentionLift: "string", tokenCostChange: "string", confidenceNote: "string" },
    confidence: { score: "0-1", level: "high|medium|low", reason: "string" },
    evidence: [{ metric: "string", value: "string", source: "string" }],
    suggestedExperiments: [{ name: "string", hypothesis: "string", metric: "string", duration: "string" }],
    generatedAt: "ISO datetime",
    evidenceSufficiency: "enough|insufficient",
  };
  const systemPrompt = [
    "你是VerseCraft后台AI运营分析官，负责分析事件健康、严格顺序漏斗、内容质量、问卷主题、用户风险、反馈、留存、在线与Token成本。",
    "你只能依据输入数据给出建议，禁止编造证据、趋势、样本或结论。",
    "如果 eventHealth 不可信，整体 evidenceSufficiency 必须为 insufficient。",
    "如果 strictPlayerJourney.sampleSize < 20，任何 recommendation.confidence 都不得为 high。",
    "如果 surveyThemes.sampleSize < 10，问卷只能作为方向参考，不得单独支撑高置信结论。",
    "当证据不足时，必须明确写出“证据不足”，只能建议补采或核查，不得给高置信策略结论。",
    "建议必须按优先级：immediate / this_week / mid_term。",
    "所有 evidenceMetrics 必须来自输入里的真实指标，不要引用不存在的表、字段或样本。",
    "请严格以 JSON 格式输出。",
    `输出结构必须匹配：${JSON.stringify(schemaHint)}`,
  ].join("\n");

  try {
    const ai = await runBackofficeReasonerJsonTask({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `以下是结构化输入数据：\n${JSON.stringify(input)}` },
      ],
      ctx: {
        requestId,
        path: "/lib/admin/aiInsights",
      },
    });

    if (!ai.ok) {
      return { input, output: fallbackFromInput(input), model: "local-rule-fallback", degraded: true };
    }

    const content = String(ai.content ?? "{}");
    const parsedRaw = JSON.parse(content) as unknown;
    const parsed = validateOrFallbackAiInsightOutput(parsedRaw, input);
    if (!parsed) {
      return { input, output: fallbackFromInput(input), model: "local-rule-fallback", degraded: true };
    }
    parsed.generatedAt = parsed.generatedAt || new Date().toISOString();
    parsed.evidenceSufficiency = parsed.evidenceSufficiency || input.evidenceQuality;
    return { input, output: parsed, model: ai.logicalRole, degraded: false };
  } catch {
    return { input, output: fallbackFromInput(input), model: "local-rule-fallback", degraded: true };
  }
}

export async function generateRuleFallbackAiInsightReport(range: AdminTimeRange): Promise<{
  range: AdminTimeRange;
  model: string;
  degraded: boolean;
  stale: boolean;
  input: AiInsightInput;
  output: AiInsightOutput;
}> {
  const input = await buildAiInsightInput(range);
  return {
    range,
    model: "local-rule-fallback",
    degraded: true,
    stale: false,
    input,
    output: fallbackFromInput(input),
  };
}

export async function getCachedAiInsightReport(range: AdminTimeRange): Promise<{
  range: AdminTimeRange;
  model: string;
  degraded: boolean;
  stale: boolean;
  input: AiInsightInput;
  output: AiInsightOutput;
} | null> {
  const scopeKey = buildAdminScopeKey(range);
  const row = await readLatestAiAnalysisSnapshot({
    task: "admin_insight",
    scopeKey,
  });
  if (!row) return null;
  if (!isAiInsightInputCurrent(row.inputJson)) return null;
  const input = row.inputJson;
  const output = validateOrFallbackAiInsightOutput(row.outputJson, input) ?? fallbackFromInput(input);
  const stale = Date.now() >= new Date(row.staleAt).getTime();
  return {
    range,
    model: row.modelRole,
    degraded: false,
    stale,
    input,
    output,
  };
}

export async function refreshAiInsightReport(range: AdminTimeRange): Promise<{
  range: AdminTimeRange;
  model: string;
  degraded: boolean;
  stale: boolean;
  input: AiInsightInput;
  output: AiInsightOutput;
}> {
  const report = await generateAiInsightReport(range);
  const scopeKey = buildAdminScopeKey(range);
  const generatedAt = new Date();
  const staleAt = new Date(generatedAt.getTime() + ADMIN_ANALYSIS_TTL_MS);
  await upsertAiAnalysisSnapshot({
    task: "admin_insight",
    scopeKey,
    inputJson: report.input as unknown as Record<string, unknown>,
    outputJson: report.output as unknown as Record<string, unknown>,
    modelRole: report.model,
    dataRevision: buildAdminDataRevision(report.input),
    staleAt,
    generatedAt,
  });
  return {
    range,
    model: report.model,
    degraded: report.degraded,
    stale: false,
    input: report.input,
    output: report.output,
  };
}

