import type { AdminTimeRange } from "@/lib/admin/timeRange";
import {
  PRODUCT_SURVEY_KEY_HOME,
  DISCOVERY_SOURCE_OPTIONS,
  EXPERIENCE_STAGE_OPTIONS,
  CREATE_FRICTION_OPTIONS,
  IMMERSION_ISSUE_OPTIONS,
  CORE_FUN_POINT_OPTIONS,
  QUIT_REASON_OPTIONS,
  SAVE_LOSS_CONCERN_OPTIONS,
  RECOMMEND_WILLINGNESS_OPTIONS,
} from "@/lib/survey/productSurveyHomeV1";

type SurveyOption = { value: string; label: string };
type SurveyQuestionId =
  | "discoverySource"
  | "experienceStage"
  | "createFriction"
  | "immersionIssue"
  | "coreFunPoint"
  | "quitReason"
  | "saveLossConcern"
  | "recommendWillingness"
  | "topFixOne"
  | "finalSuggestion";

export type SurveyAggregateQuestion = {
  id: SurveyQuestionId;
  title: string;
  kind: "single" | "text";
  sampleCount: number;
  options?: Array<{ value: string; label: string; count: number; pct: number }>;
  textCount?: number;
};

export type SurveyAggregateResponseRow = {
  userId?: unknown;
  guestId?: unknown;
  surveyVersion?: unknown;
  answers?: unknown;
  freeText?: unknown;
  overallRating?: unknown;
  recommendScore?: unknown;
  clientMeta?: unknown;
  createdAt?: unknown;
};

export type SurveyAggregateEventRow = {
  eventName?: unknown;
  actorKey?: unknown;
  payload?: unknown;
  eventTime?: unknown;
};

export type SurveyAggregateReport = {
  range: Pick<AdminTimeRange, "preset" | "start" | "end" | "startDateKey" | "endDateKey" | "label">;
  surveyKey: string;
  totalResponses: number;
  evidenceSufficiency: "enough" | "insufficient";
  questions: SurveyAggregateQuestion[];
  completionFunnel: Array<{
    eventName: string;
    label: string;
    count: number;
    stepConversionRate: number;
    totalConversionRate: number;
  }>;
  perQuestionDropoff: Array<{
    questionId: SurveyQuestionId;
    title: string;
    stepIndex: number;
    viewed: number;
    nextCount: number;
    dropOffCount: number;
    dropOffRate: number;
  }>;
  optionDistribution: SurveyAggregateQuestion[];
  textThemes: Array<{ theme: string; count: number; pct: number }>;
  lowRatingSamples: Array<{
    overallRating: number | null;
    recommendScore: number | null;
    experienceStage: string;
    summary: string;
    createdAt: string | null;
  }>;
  recommendScoreDistribution: Array<{ bucket: string; label: string; count: number; pct: number }>;
  segmentBreakdown: {
    actorType: Array<{ segment: "registered" | "guest" | "unknown"; count: number; pct: number }>;
    platform: Array<{ segment: string; count: number; pct: number }>;
    experienceStage: Array<{ segment: string; label: string; count: number; pct: number }>;
  };
};

const HOME_SURVEY_META: Array<
  | { id: Exclude<SurveyQuestionId, "topFixOne" | "finalSuggestion">; kind: "single"; title: string; options: SurveyOption[] }
  | { id: "topFixOne" | "finalSuggestion"; kind: "text"; title: string }
> = [
  { id: "discoverySource", kind: "single", title: "你从哪里知道 VerseCraft？", options: DISCOVERY_SOURCE_OPTIONS },
  { id: "experienceStage", kind: "single", title: "当前体验阶段", options: EXPERIENCE_STAGE_OPTIONS },
  { id: "createFriction", kind: "single", title: "角色创建阻力", options: CREATE_FRICTION_OPTIONS },
  { id: "immersionIssue", kind: "single", title: "最影响沉浸的问题", options: IMMERSION_ISSUE_OPTIONS },
  { id: "coreFunPoint", kind: "single", title: "当前最有趣的点", options: CORE_FUN_POINT_OPTIONS },
  { id: "quitReason", kind: "single", title: "中途退出原因", options: QUIT_REASON_OPTIONS },
  { id: "topFixOne", kind: "text", title: "最优先修复的问题" },
  { id: "saveLossConcern", kind: "single", title: "存档担忧", options: SAVE_LOSS_CONCERN_OPTIONS },
  { id: "recommendWillingness", kind: "single", title: "推荐意愿", options: RECOMMEND_WILLINGNESS_OPTIONS },
  { id: "finalSuggestion", kind: "text", title: "最后补充" },
];

const FUNNEL_EVENTS = [
  { eventName: "survey_entry_exposed", label: "入口曝光" },
  { eventName: "survey_entry_clicked", label: "点击入口" },
  { eventName: "survey_modal_opened", label: "打开问卷" },
  { eventName: "survey_started", label: "开始填写" },
  { eventName: "survey_submit_attempted", label: "尝试提交" },
  { eventName: "survey_submitted", label: "提交成功" },
] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function n(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function objectOf(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function labelForOption(options: SurveyOption[], value: string): string {
  return options.find((opt) => opt.value === value)?.label ?? (value || "未填写");
}

function sanitizeOpenText(value: string, maxChars = 120): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b1[3-9]\d{9}\b/g, "[phone]")
    .replace(/\b\d{6,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function classifyTextTheme(input: string): string {
  const t = input.toLowerCase();
  if (/等待|太久|很久|慢|卡|延迟|加载|loading|timeout/.test(t)) return "等待太久";
  if (/看不懂|不懂|规则|复杂|说明|门槛|理解/.test(t)) return "看不懂规则";
  if (/下一步|不知道|引导|迷路|去哪|做什么/.test(t)) return "不知道下一步";
  if (/文本|叙事|不稳定|重复|乱|跑偏|口癖|人设/.test(t)) return "文本不稳定";
  if (/存档|进度|保存|丢失|丢档|云存档|找不到档/.test(t)) return "存档担忧";
  if (/ui|界面|按钮|入口|路径|菜单|找不到|操作/.test(t)) return "UI 路径复杂";
  if (/目标|玩法|深度|动力|成长|奖励|循环/.test(t)) return "玩法目标不足";
  return "其他";
}

function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function sortedCounts(map: Map<string, number>, limit = 20): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function actorKeyFor(row: SurveyAggregateEventRow): string {
  const direct = text(row.actorKey);
  if (direct) return direct;
  const payload = objectOf(row.payload);
  return text(payload.actorId) || text(payload.guestId) || text(payload.sessionId) || "unknown";
}

function normalizePlatform(value: unknown): string {
  const raw = text(value).toLowerCase();
  if (raw === "mobile" || raw === "desktop") return raw;
  return "unknown";
}

function actorTypeFor(row: SurveyAggregateResponseRow): "registered" | "guest" | "unknown" {
  if (text(row.userId)) return "registered";
  if (text(row.guestId)) return "guest";
  const meta = objectOf(row.clientMeta);
  const raw = text(meta.actorType);
  if (raw === "user" || raw === "registered") return "registered";
  if (raw === "guest") return "guest";
  return "unknown";
}

function answerObject(row: SurveyAggregateResponseRow): Record<string, unknown> {
  return objectOf(row.answers);
}

function openTextsFor(row: SurveyAggregateResponseRow): string[] {
  const ans = answerObject(row);
  return [text(ans.topFixOne), text(ans.finalSuggestion), text(row.freeText)]
    .map((value) => sanitizeOpenText(value, 240))
    .filter(Boolean);
}

export function buildSurveyAggregateReport(
  range: AdminTimeRange,
  responseRows: SurveyAggregateResponseRow[],
  eventRows: SurveyAggregateEventRow[]
): SurveyAggregateReport {
  const totalResponses = responseRows.length;
  const countsByQ = new Map<SurveyQuestionId, Map<string, number>>();
  const textCountByQ = new Map<Extract<SurveyQuestionId, "topFixOne" | "finalSuggestion">, number>();
  const themeCounts = new Map<string, number>();
  const recommendCounts = new Map<string, number>();
  const actorTypeCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();
  const experienceCounts = new Map<string, number>();
  const lowRatingSamples: SurveyAggregateReport["lowRatingSamples"] = [];

  for (const row of responseRows) {
    const answers = answerObject(row);
    const actorType = actorTypeFor(row);
    const meta = objectOf(row.clientMeta);
    const platform = normalizePlatform(meta.platform);
    const experienceStage = text(answers.experienceStage) || "unknown";
    bump(actorTypeCounts, actorType);
    bump(platformCounts, platform);
    bump(experienceCounts, experienceStage);

    for (const q of HOME_SURVEY_META) {
      if (q.kind === "single") {
        const value = text(answers[q.id]);
        if (!value) continue;
        const current = countsByQ.get(q.id) ?? new Map<string, number>();
        bump(current, value);
        countsByQ.set(q.id, current);
      } else {
        const value = text(answers[q.id]);
        if (value) textCountByQ.set(q.id, (textCountByQ.get(q.id) ?? 0) + 1);
      }
    }

    for (const openText of openTextsFor(row)) {
      bump(themeCounts, classifyTextTheme(openText));
    }

    const recommendScore = Number.isFinite(n(row.recommendScore)) && row.recommendScore != null ? Math.max(0, Math.min(10, Math.round(n(row.recommendScore)))) : null;
    const recommendWillingness = text(answers.recommendWillingness);
    if (recommendScore != null) bump(recommendCounts, `score_${recommendScore}`);
    else if (recommendWillingness) bump(recommendCounts, recommendWillingness);

    const overallRating = row.overallRating == null ? null : Math.max(1, Math.min(5, Math.round(n(row.overallRating))));
    const isLow = (overallRating != null && overallRating <= 2) || (recommendScore != null && recommendScore <= 4);
    if (isLow && lowRatingSamples.length < 12) {
      const summary = openTextsFor(row)[0] ?? "";
      lowRatingSamples.push({
        overallRating,
        recommendScore,
        experienceStage,
        summary: sanitizeOpenText(summary || "未填写开放文本"),
        createdAt: iso(row.createdAt),
      });
    }
  }

  const questions: SurveyAggregateQuestion[] = HOME_SURVEY_META.map((q) => {
    if (q.kind === "text") {
      return {
        id: q.id,
        title: q.title,
        kind: "text",
        sampleCount: totalResponses,
        textCount: textCountByQ.get(q.id) ?? 0,
      };
    }
    const counts = countsByQ.get(q.id) ?? new Map<string, number>();
    const answered = [...counts.values()].reduce((sum, count) => sum + count, 0);
    return {
      id: q.id,
      title: q.title,
      kind: "single",
      sampleCount: answered,
      options: q.options
        .map((opt) => {
          const count = counts.get(opt.value) ?? 0;
          return { value: opt.value, label: opt.label, count, pct: pct(count, answered) };
        })
        .filter((item) => item.count > 0 || answered === 0)
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    };
  });

  const actorSetsByEvent = new Map<string, Set<string>>();
  const viewedByStep = new Map<number, Set<string>>();
  for (const row of eventRows) {
    const eventName = text(row.eventName);
    const actorKey = actorKeyFor(row);
    const payload = objectOf(row.payload);
    if (eventName) {
      const set = actorSetsByEvent.get(eventName) ?? new Set<string>();
      set.add(actorKey);
      actorSetsByEvent.set(eventName, set);
    }
    if (eventName === "survey_step_viewed") {
      const stepIndex = Math.trunc(n(payload.stepIndex));
      if (stepIndex >= 0) {
        const set = viewedByStep.get(stepIndex) ?? new Set<string>();
        set.add(actorKey);
        viewedByStep.set(stepIndex, set);
      }
    }
  }

  const base = actorSetsByEvent.get(FUNNEL_EVENTS[0].eventName)?.size ?? 0;
  const completionFunnel = FUNNEL_EVENTS.map((item, index) => {
    const count = actorSetsByEvent.get(item.eventName)?.size ?? 0;
    const prev = index === 0 ? count : actorSetsByEvent.get(FUNNEL_EVENTS[index - 1]?.eventName ?? "")?.size ?? 0;
    return {
      eventName: item.eventName,
      label: item.label,
      count,
      stepConversionRate: index === 0 ? 1 : rate(count, prev),
      totalConversionRate: index === 0 ? 1 : rate(count, base),
    };
  });

  const submitAttemptCount = actorSetsByEvent.get("survey_submit_attempted")?.size ?? 0;
  const perQuestionDropoff = HOME_SURVEY_META.map((q, index) => {
    const viewed = viewedByStep.get(index)?.size ?? 0;
    const nextCount = index === HOME_SURVEY_META.length - 1 ? submitAttemptCount : viewedByStep.get(index + 1)?.size ?? 0;
    const dropOffCount = Math.max(0, viewed - nextCount);
    return {
      questionId: q.id,
      title: q.title,
      stepIndex: index,
      viewed,
      nextCount,
      dropOffCount,
      dropOffRate: rate(dropOffCount, viewed),
    };
  });

  const textThemeTotal = [...themeCounts.values()].reduce((sum, count) => sum + count, 0);
  const textThemes = sortedCounts(themeCounts, 8).map((item) => ({
    theme: item.key,
    count: item.count,
    pct: pct(item.count, textThemeTotal),
  }));

  const recommendTotal = [...recommendCounts.values()].reduce((sum, count) => sum + count, 0);
  const recommendScoreDistribution = sortedCounts(recommendCounts, 20).map((item) => {
    const willingness = RECOMMEND_WILLINGNESS_OPTIONS.find((opt) => opt.value === item.key);
    return {
      bucket: item.key,
      label: willingness?.label ?? item.key.replace(/^score_/, ""),
      count: item.count,
      pct: pct(item.count, recommendTotal),
    };
  });

  const segment = (map: Map<string, number>, labeler?: (value: string) => string) => {
    const total = [...map.values()].reduce((sum, count) => sum + count, 0);
    return sortedCounts(map, 20).map((item) => ({
      segment: item.key,
      label: labeler?.(item.key) ?? item.key,
      count: item.count,
      pct: pct(item.count, total),
    }));
  };

  const maxSample = Math.max(totalResponses, ...completionFunnel.map((item) => item.count));
  return {
    range: {
      preset: range.preset,
      start: range.start,
      end: range.end,
      startDateKey: range.startDateKey,
      endDateKey: range.endDateKey,
      label: range.label,
    },
    surveyKey: PRODUCT_SURVEY_KEY_HOME,
    totalResponses,
    evidenceSufficiency: maxSample >= 20 ? "enough" : "insufficient",
    questions,
    completionFunnel,
    perQuestionDropoff,
    optionDistribution: questions.filter((q) => q.kind === "single"),
    textThemes,
    lowRatingSamples,
    recommendScoreDistribution,
    segmentBreakdown: {
      actorType: segment(actorTypeCounts).map((item) => ({
        segment: item.segment === "registered" || item.segment === "guest" ? item.segment : "unknown",
        count: item.count,
        pct: item.pct,
      })),
      platform: segment(platformCounts).map((item) => ({ segment: item.segment, count: item.count, pct: item.pct })),
      experienceStage: segment(experienceCounts, (value) => labelForOption(EXPERIENCE_STAGE_OPTIONS, value)),
    },
  };
}
