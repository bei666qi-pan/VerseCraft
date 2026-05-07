import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { runBackofficeReasonerJsonTask } from "@/lib/ai/logicalTasks";
import { createRequestId } from "@/lib/security/helpers";
import type { AdminTimeRange } from "@/lib/admin/timeRange";
import { getFeedbackInsights, getFunnelMetrics, getOverviewMetrics, getRealtimeMetrics, getRetentionMetrics } from "@/lib/admin/service";
import { validateAiInsightOutput } from "@/lib/admin/aiInsightSchema";
import { readLatestAiAnalysisSnapshot, upsertAiAnalysisSnapshot } from "@/lib/ai/analysis/snapshotStore";

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

export async function buildAiInsightInput(range: AdminTimeRange): Promise<AiInsightInput> {
  const [overview, retention, funnel, feedback, realtime, survey] = await Promise.all([
    getOverviewMetrics(range),
    getRetentionMetrics(range),
    getFunnelMetrics(range),
    getFeedbackInsights(range),
    getRealtimeMetrics(),
    getSurveyEvidence(range),
  ]);
  const negativeRate = feedback.totalFeedback > 0 ? feedback.negativeFeedback / feedback.totalFeedback : 0;
  const samples = (((feedback as unknown as { samples?: string[] }).samples) ?? []).map(cleanFeedbackText).filter(Boolean).slice(0, 12);
  const anomalyHints: string[] = [];
  if ((retention.d1?.rate ?? 1) < 0.2) anomalyHints.push("D1留存低于20%");
  if ((realtime.trends?.eventsLast5m ?? 0) > (realtime.trends?.eventsLast15m ?? 0)) anomalyHints.push("近5分钟事件波动偏高");
  if (overview.cards.dau > 0 && overview.cards.todayTokenCost / overview.cards.dau > 5000) anomalyHints.push("人均Token成本偏高");
  const evidenceQuality = Math.max(feedback.totalFeedback, survey.sampleSize) < 10 || Number(overview.cards.activeUsersRange ?? 0) < 20 ? "insufficient" : "enough";
  return {
    range: { preset: range.preset, startDateKey: range.startDateKey, endDateKey: range.endDateKey, label: range.label },
    metrics: { overview: overview.cards, retention, funnel, realtime },
    feedback: { totalFeedback: feedback.totalFeedback, negativeFeedback: feedback.negativeFeedback, negativeRate, topTopics: feedback.topics.slice(0, 5), samples },
    survey,
    anomalyHints,
    evidenceQuality,
  };
}

function fallbackFromInput(input: AiInsightInput): AiInsightOutput {
  const activeUsers = Number((input.metrics.overview as { activeUsersRange?: number }).activeUsersRange ?? 0);
  const feedbackSample = Number(input.feedback.totalFeedback ?? 0);
  const surveySample = Number(input.survey.sampleSize ?? 0);
  const sampleSize = Math.max(activeUsers, feedbackSample, surveySample);
  const insufficient = input.evidenceQuality === "insufficient";
  return {
    executiveSummary: input.evidenceQuality === "insufficient" ? "证据不足：当前样本量不足以给出高置信度优化建议。" : "存在留存与成本双重压力，建议优先处理新手链路和高频负反馈。",
    recommendations: [
      {
        priority: insufficient ? "immediate" : "this_week",
        title: insufficient ? "证据不足，先补齐关键采样" : "优先定位新手链路流失",
        claim: insufficient ? "当前样本不足以支撑高置信运营结论。" : "现有样本可以支持一次低风险漏斗排查。",
        evidenceMetrics: [
          { metricId: "overview.active_actors_today", label: "活跃样本", value: String(activeUsers), source: "admin_metrics_daily" },
          { metricId: "content.feedback_sample", label: "反馈样本", value: String(feedbackSample), source: "feedbacks" },
          { metricId: "content.survey_sample", label: "问卷样本", value: String(surveySample), source: "survey_responses" },
        ],
        sampleSize,
        confidence: insufficient ? "low" : "medium",
        risk: insufficient ? "直接调整玩法可能误判真实流失原因。" : "未分组验证时不要一次改变多个新手节点。",
        suggestedExperiment: insufficient ? "先补齐首页、角色创建、第一轮行动和等待中退出埋点。" : "对首轮行动引导做小流量 A/B。",
        expectedImpact: insufficient ? "提高后续诊断可信度。" : "改善第一轮行动抵达率与 D1 留存。",
        nextAction: insufficient ? "检查玩家旅程 tab 中样本为 0 的阶段。" : "查看玩家旅程相邻转化最低的阶段。",
      },
    ],
    retentionRisks: [],
    productProblems: [],
    opportunityPoints: [],
    top3Actions: [],
    expectedImpact: { confidenceNote: "模型调用失败，使用本地降级结论。" },
    confidence: { score: 0.35, level: "low", reason: "模型调用失败或证据不足" },
    evidence: [
      { metric: "activeUsersRange", value: String((input.metrics.overview as { activeUsersRange?: number }).activeUsersRange ?? 0), source: "admin_metrics_daily" },
      { metric: "negativeRate", value: `${(input.feedback.negativeRate * 100).toFixed(1)}%`, source: "feedbacks" },
      { metric: "surveySample", value: String(surveySample), source: "survey_responses" },
    ],
    suggestedExperiments: [],
    generatedAt: new Date().toISOString(),
    evidenceSufficiency: input.evidenceQuality,
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
    "你是VerseCraft后台AI运营分析官，负责分析问卷、反馈、留存、旅程漏斗、在线与Token成本。",
    "你只能依据输入数据给出建议，禁止编造证据、趋势、样本或结论。",
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
      return { input, output: fallbackFromInput(input), model: "none", degraded: true };
    }

    const content = String(ai.content ?? "{}");
    const parsedRaw = JSON.parse(content) as unknown;
    const parsed = validateAiInsightOutput(parsedRaw);
    if (!parsed) {
      return { input, output: fallbackFromInput(input), model: ai.logicalRole, degraded: true };
    }
    parsed.generatedAt = parsed.generatedAt || new Date().toISOString();
    parsed.evidenceSufficiency = parsed.evidenceSufficiency || input.evidenceQuality;
    return { input, output: parsed, model: ai.logicalRole, degraded: false };
  } catch {
    return { input, output: fallbackFromInput(input), model: "none", degraded: true };
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
  const input = row.inputJson as AiInsightInput;
  const output = validateAiInsightOutput(row.outputJson) ?? fallbackFromInput(input);
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

