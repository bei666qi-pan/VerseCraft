import "server-only";

import { executeChatCompletion } from "@/lib/ai/service";
import { createRequestId } from "@/lib/security/helpers";
import type { AdminTimeRange } from "@/lib/admin/timeRange";
import { getFeedbackInsights, getFunnelMetrics, getOverviewMetrics, getRealtimeMetrics, getRetentionMetrics } from "@/lib/admin/service";
import { validateAiInsightOutput } from "@/lib/admin/aiInsightSchema";

export type AiInsightInput = {
  range: { preset: string; startDateKey: string; endDateKey: string; label: string };
  metrics: { overview: Record<string, unknown>; retention: Record<string, unknown>; funnel: Record<string, unknown>; realtime: Record<string, unknown> };
  feedback: { totalFeedback: number; negativeFeedback: number; negativeRate: number; topTopics: Array<{ topic: string; count: number }>; samples: string[] };
  anomalyHints: string[];
  evidenceQuality: "enough" | "insufficient";
};

export type AiInsightOutput = {
  executiveSummary: string;
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

function cleanFeedbackText(input: string): string {
  return input.replace(/\s+/g, " ").replace(/[^\u4e00-\u9fa5a-zA-Z0-9,.;:!?()\-\s]/g, "").trim().slice(0, 200);
}

export async function buildAiInsightInput(range: AdminTimeRange): Promise<AiInsightInput> {
  const [overview, retention, funnel, feedback, realtime] = await Promise.all([
    getOverviewMetrics(range),
    getRetentionMetrics(range),
    getFunnelMetrics(range),
    getFeedbackInsights(range),
    getRealtimeMetrics(),
  ]);
  const negativeRate = feedback.totalFeedback > 0 ? feedback.negativeFeedback / feedback.totalFeedback : 0;
  const samples = (((feedback as unknown as { samples?: string[] }).samples) ?? []).map(cleanFeedbackText).filter(Boolean).slice(0, 12);
  const anomalyHints: string[] = [];
  if ((retention.d1?.rate ?? 1) < 0.2) anomalyHints.push("D1留存低于20%");
  if ((realtime.trends?.eventsLast5m ?? 0) > (realtime.trends?.eventsLast15m ?? 0)) anomalyHints.push("近5分钟事件波动偏高");
  if (overview.cards.dau > 0 && overview.cards.todayTokenCost / overview.cards.dau > 5000) anomalyHints.push("人均Token成本偏高");
  const evidenceQuality = feedback.totalFeedback < 10 || Number(overview.cards.activeUsersRange ?? 0) < 20 ? "insufficient" : "enough";
  return {
    range: { preset: range.preset, startDateKey: range.startDateKey, endDateKey: range.endDateKey, label: range.label },
    metrics: { overview: overview.cards, retention, funnel, realtime },
    feedback: { totalFeedback: feedback.totalFeedback, negativeFeedback: feedback.negativeFeedback, negativeRate, topTopics: feedback.topics.slice(0, 5), samples },
    anomalyHints,
    evidenceQuality,
  };
}

function fallbackFromInput(input: AiInsightInput): AiInsightOutput {
  return {
    executiveSummary: input.evidenceQuality === "insufficient" ? "证据不足：当前样本量不足以给出高置信度优化建议。" : "存在留存与成本双重压力，建议优先处理新手链路和高频负反馈。",
    retentionRisks: [],
    productProblems: [],
    opportunityPoints: [],
    top3Actions: [],
    expectedImpact: { confidenceNote: "模型调用失败，使用本地降级结论。" },
    confidence: { score: 0.35, level: "low", reason: "模型调用失败或证据不足" },
    evidence: [
      { metric: "activeUsersRange", value: String((input.metrics.overview as { activeUsersRange?: number }).activeUsersRange ?? 0), source: "admin_metrics_daily" },
      { metric: "negativeRate", value: `${(input.feedback.negativeRate * 100).toFixed(1)}%`, source: "feedbacks" },
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
  const systemPrompt = ["你是VerseCraft后台AI运营分析官。", "你只能依据输入数据给出建议，禁止编造证据。", "当证据不足时，必须明确写出“证据不足”。", "建议必须按优先级：immediate / this_week / mid_term。", "请严格以 JSON 格式输出。", `输出结构必须匹配：${JSON.stringify(schemaHint)}`].join("\n");

  try {
    const ai = await executeChatCompletion({
      task: "admin_insight",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `以下是结构化输入数据：\n${JSON.stringify(input)}` },
      ],
      ctx: {
        requestId,
        task: "admin_insight",
        path: "/lib/admin/aiInsights",
      },
      maxTokens: 4096,
      temperature: 0.2,
      responseFormatJsonObject: true,
    });

    if (!ai.ok) {
      return { input, output: fallbackFromInput(input), model: "none", degraded: true };
    }

    const content = String(ai.content ?? "{}");
    const parsedRaw = JSON.parse(content) as unknown;
    const parsed = validateAiInsightOutput(parsedRaw);
    if (!parsed) {
      return { input, output: fallbackFromInput(input), model: ai.modelId, degraded: true };
    }
    parsed.generatedAt = parsed.generatedAt || new Date().toISOString();
    parsed.evidenceSufficiency = parsed.evidenceSufficiency || input.evidenceQuality;
    return { input, output: parsed, model: ai.modelId, degraded: false };
  } catch {
    return { input, output: fallbackFromInput(input), model: "none", degraded: true };
  }
}

