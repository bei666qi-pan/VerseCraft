"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileText,
  HeartPulse,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { clearAdminShadowSession } from "@/app/actions/admin";
import type { AdminApiEnvelope } from "@/lib/admin/apiEnvelope";
import { readAdminResponseJson } from "@/lib/admin/parseAdminEnvelope";
import { formatDurationSeconds } from "@/lib/time/durationUnits";

type ChartPoint = { date: string; tokens: number; activeUsers?: number; dailyTokens?: number };
type DashboardUserRow = { id: string; name: string; tokensUsed: number; playTime: number; lastActive: string | Date; isOnline: number; feedbackContent: string; feedbackCreatedAt: string | null };

type Props = {
  rows: DashboardUserRow[];
  onlineCount: number;
  totalUsers: number;
  totalTokens: number;
  chartData?: ChartPoint[];
};

type Kpi = {
  metricId: string;
  label: string;
  value: number | string | null;
  unit?: string;
  source: string;
  definition: string;
  updatedAt: string | null;
  degraded: boolean;
  reason: string | null;
};

type OverviewData = { cards?: Record<string, number>; kpis?: Kpi[]; chartData?: ChartPoint[]; updatedAt?: string } | null;
type JourneyData = {
  mode?: "strict" | "any_order";
  sampleSize?: number;
  evidenceSufficiency?: string;
  stages?: Array<{
    eventName: string;
    label: string;
    count: number;
    stepConversionRate: number;
    totalConversionRate: number;
    dropOffCount?: number;
    dropOffRate?: number;
    isBiggestDrop?: boolean;
    metricId: string;
  }>;
  updatedAt?: string;
} | null;
type AiExperienceData = {
  sampleSize?: number;
  evidenceSufficiency?: string;
  metrics?: Kpi[];
  rates?: { successRate?: number; failureRate?: number; fallbackRate?: number; parseFailureRate?: number; rateLimitRate?: number; queueWait?: { status?: string } };
  rateLimitCount?: number;
  cost?: { totalTokens?: number; tokenPerEffectiveAction?: number; tokenPerActiveActor?: number; highCostActors?: Array<{ actorKey: string; actions: number; tokens: number }> };
  anomalies?: string[];
  updatedAt?: string;
} | null;
type ContentQualityData = {
  sampleSize?: number;
  evidenceSufficiency?: string;
  worldSelections?: Array<{ worldId: string; count: number; firstActionCount?: number; firstActionRate?: number }>;
  worldFirstActionRate?: number;
  chapters?: {
    entered?: Array<{ worldId: string; chapterId: string; count: number }>;
    completed?: Array<{ worldId: string; chapterId: string; count: number }>;
    abandoned?: Array<{ worldId: string; chapterId: string; count: number }>;
    rank?: Array<{ worldId: string; chapterId: string; entered: number; completed: number; abandoned: number; completionRate: number; abandonRate: number }>;
    completionRate?: number;
    abandonRate?: number;
    evidenceSufficiency?: string;
  };
  npcInteractions?: {
    rank?: Array<{ npcId: string; started: number; completed: number; failed: number; completionRate: number; failureRate: number }>;
    completionRate?: number;
    failureRate?: number;
  };
  validatorIssues?: { total?: number; byCode?: Array<{ code: string; count: number }> };
  validatorIssueCount?: number;
  retryRegenerationCount?: number;
  retryRegeneration?: { retryCount?: number; regenCount?: number; total?: number };
  feedbackTopics?: Array<{ topic?: string; count?: number }>;
  feedbackSampleSize?: number;
  negativeFeedbackRate?: number;
  surveySampleSize?: number;
  updatedAt?: string;
} | null;
type SurveyAggregateData = {
  evidenceSufficiency?: string;
  totalResponses?: number;
  completionFunnel?: Array<{
    eventName: string;
    label: string;
    count: number;
    stepConversionRate: number;
    totalConversionRate: number;
  }>;
  perQuestionDropoff?: Array<{
    questionId: string;
    title: string;
    stepIndex: number;
    viewed: number;
    nextCount: number;
    dropOffCount: number;
    dropOffRate: number;
  }>;
  textThemes?: Array<{ theme: string; count: number; pct: number }>;
  lowRatingSamples?: Array<{
    overallRating: number | null;
    recommendScore: number | null;
    experienceStage: string;
    summary: string;
    createdAt: string | null;
  }>;
  recommendScoreDistribution?: Array<{ bucket: string; label: string; count: number; pct: number }>;
  segmentBreakdown?: {
    actorType?: Array<{ segment: string; count: number; pct: number }>;
    platform?: Array<{ segment: string; count: number; pct: number }>;
    experienceStage?: Array<{ segment: string; label?: string; count: number; pct: number }>;
  };
} | null;
type EventHealthData = {
  totalEvents?: number;
  eventsByName?: Array<{ eventName: string; count: number }>;
  invalidContractCount?: number;
  missingActorCount?: number;
  missingGuestCount?: number;
  anonSessionCount?: number;
  unknownPlatformCount?: number;
  missingWorldIdCount?: number;
  missingChapterIdCount?: number;
  rates?: {
    invalidContractRate?: number;
    missingActorRate?: number;
    missingGuestRate?: number;
    anonSessionRate?: number;
    unknownPlatformRate?: number;
    missingWorldIdRate?: number;
    missingChapterIdRate?: number;
  };
  topInvalidEvents?: Array<{ eventName: string; count: number; reasons?: Array<{ reason: string; count: number }> }>;
  topMissingProperties?: Array<{ property: string; count: number; eventName: string | null }>;
  eventCoverage?: Array<{ eventName: string; label: string; count: number; covered: boolean; status: string }>;
  evidenceSufficiency?: string;
  updatedAt?: string;
} | null;
type CapacityData = {
  online?: {
    registered?: number;
    guests?: number;
    total?: number;
    activeSessions?: number;
    windowSeconds?: number;
    source?: string;
  };
  chatQueue?: {
    enabled?: boolean;
    running?: number | null;
    queued?: number | null;
    maxRunning?: number;
    maxQueued?: number;
    remainingImmediate?: number | null;
    remainingQueueSlots?: number | null;
    estimatedSecondsPerTurn?: number;
  };
  estimate?: {
    status?: string;
    remainingConcurrentActions?: number | null;
    confidence?: string;
    explanation?: string;
  };
  evidence?: {
    recentAiRequests?: number;
    dbOk?: boolean;
    aiGatewayOk?: boolean;
    queueDepthKnown?: boolean;
  };
};
type HealthData = {
  checks?: Record<string, { ok: boolean; degraded: boolean; reason: string | null; updatedAt: string; meta?: Record<string, unknown> }>;
  cron?: { lastRebuildAt?: string | null };
  aggregationFreshness?: string | null;
  recentErrors?: number;
  deployment?: { commitSha?: string | null; nodeEnv?: string };
  capacity?: CapacityData;
  updatedAt?: string;
} | null;
type UserRow = { actorKey: string; name: string; actorType: string; tokensUsed: number; playTime: number; lastActive: string | null; isOnline: boolean };
type UsersData = { rows: UserRow[]; nextCursor: string | null; hasMore: boolean; totalApprox: number; limit: number } | null;
type UserDetail = {
  actorKey: string;
  basic?: { name?: string; actorType?: string; tokensUsed?: number; playTime?: number; lastActive?: string | null };
  journeyStage?: { currentLabel?: string | null; nextLabel?: string | null; status?: string; stageIndex?: number; totalStages?: number };
  contentPath?: {
    worlds?: Array<{ worldId: string; count: number; lastEventAt: string | null }>;
    chapters?: Array<{ worldId: string; chapterId: string; entered: number; completed: number; abandoned: number; lastEventAt: string | null }>;
    npcs?: Array<{ npcId: string; started: number; completed: number; failed: number; lastEventAt: string | null }>;
  };
  aiExperience?: { requestCount?: number; avgLatency?: number; failureCount?: number; fallbackCount?: number; slowRequestCount?: number; tokenCost?: number };
  feedbackAndSurvey?: { negativeFeedbackCount?: number; negativeSurveyCount?: number; saveAnxietyCount?: number };
  riskTags?: string[];
  suggestedOpsActions?: string[];
  recentFeedback?: Array<{ kind: string; contentPreview: string; createdAt: string | null; negative?: boolean }>;
  recentSurvey?: Array<{
    surveyKey: string;
    overallRating: number | null;
    recommendScore: number | null;
    experienceStage?: string | null;
    quitReason?: string | null;
    saveLossConcern?: string | null;
    topFixPreview?: string;
    createdAt: string | null;
    negative?: boolean;
    saveAnxiety?: boolean;
  }>;
  recentSettlements?: Array<{ grade: string; survivalTimeSeconds: number; killedAnomalies: number; maxFloorLabel: string; createdAt: string | null }>;
  recentEvents?: Array<{ eventName: string; eventTime: string | null; page: string | null; source: string | null; payloadSummary?: Record<string, unknown> }>;
} | null;
type AuditData = { rows: Array<{ id: number; action: string; actor: string; success: boolean; reason: string | null; targetType: string | null; targetId: string | null; createdAt: string }>; nextCursor: string | null; hasMore: boolean } | null;
type AiReport = {
  model?: string;
  degraded?: boolean;
  output?: {
    executiveSummary?: string;
    recommendations?: Array<{
      priority: string;
      title: string;
      claim: string;
      evidenceMetrics: Array<{ metricId: string; label: string; value: string; source: string }>;
      sampleSize: number;
      confidence: string;
      risk: string;
      suggestedExperiment: string;
      expectedImpact: string;
      nextAction: string;
    }>;
    generatedAt?: string;
    evidenceSufficiency?: string;
  };
} | null;

const TABS = ["总览", "玩家旅程", "AI 体验", "内容质量", "数据质量", "玩家 / 游客", "系统健康", "AI 运营助手", "审计日志"] as const;
type Tab = (typeof TABS)[number];
type Range = "today" | "yesterday" | "7d" | "30d";

const tabIcons: Record<Tab, ComponentType<{ className?: string }>> = {
  总览: BarChart3,
  玩家旅程: Activity,
  "AI 体验": HeartPulse,
  内容质量: FileText,
  数据质量: ClipboardCheck,
  "玩家 / 游客": Users,
  系统健康: ShieldCheck,
  "AI 运营助手": Bot,
  审计日志: Database,
};

function percent(v: number | null | undefined): string {
  return `${(Number(v ?? 0) * 100).toFixed(1)}%`;
}

function fmt(v: number | string | null | undefined, unit?: string): string {
  if (v == null || v === "unavailable" || v === "unknown") return "暂无记录";
  if (typeof v === "number") {
    if (unit === "ratio" || unit === "failure_ratio") return percent(v);
    if (unit === "ms") return `${Math.round(v)} 毫秒`;
    return v.toLocaleString("zh-CN");
  }
  return translateLooseLabel(v);
}

function time(v: string | null | undefined): string {
  if (!v) return "未更新";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "未更新" : d.toLocaleString("zh-CN", { hour12: false });
}

function priorityLabel(v: string): string {
  if (v === "immediate") return "立即处理";
  if (v === "this_week") return "本周处理";
  return "中期观察";
}

function confidenceLabel(v: string | null | undefined): string {
  if (v === "high") return "高";
  if (v === "medium") return "中";
  return "低";
}

function actorTypeLabel(v: string | null | undefined): string {
  if (v === "registered" || v === "user") return "注册用户";
  if (v === "guest") return "游客";
  return "身份未记录";
}

function sourceLabel(v: string | null | undefined): string {
  const raw = String(v ?? "").trim();
  const map: Record<string, string> = {
    analytics_events: "行为事件记录",
    "analytics_events.token_cost": "AI 消耗事件",
    admin_metrics_daily: "每日运营聚合",
    feedbacks: "玩家反馈",
    survey_responses: "问卷记录",
    presence: "在线心跳",
    PostgreSQL: "数据库",
    Redis: "缓存与限流",
    "scripts/admin-explain-baseline.ts": "后台慢查询检查",
    unknown: "来源未登记",
  };
  return map[raw] ?? (raw.includes(".") || raw.includes("_") ? "后台记录" : raw || "来源未登记");
}

function reasonLabel(v: string | null | undefined): string {
  const raw = String(v ?? "").trim();
  const map: Record<string, string> = {
    degraded: "部分数据降级",
    one_or_more_checks_degraded: "部分健康检查降级",
    presence_unavailable: "在线心跳暂不可用",
    ai_gateway_keys_missing: "AI 网关未配置",
    redis_not_configured: "缓存未配置",
    redis_ping_failed: "缓存连接失败",
    db_unavailable: "数据库不可用",
    db_health_timeout: "数据库检查超时",
    event_health_unavailable: "数据质量接口暂不可用",
    insufficient_sample: "样本不足",
    users_unavailable: "用户列表暂不可用",
    ai_insights_unavailable: "AI 分析暂不可用",
    ai_refresh_degraded: "AI 分析已降级",
    ai_insights_snapshot_missing_used_rule_fallback: "暂无缓存快照，已使用本地规则建议",
    ai_refresh_failed_used_rule_fallback: "AI 生成失败，已使用本地规则建议",
    partial_rebuild_failed: "部分日期重建失败",
    none: "无异常",
  };
  return map[raw] ?? (raw ? "后台检查提示" : "无异常");
}

function translateLooseLabel(v: string): string {
  const map: Record<string, string> = {
    ready: "可承接",
    near_limit: "接近上限",
    full: "已满",
    sample_insufficient: "样本不足",
    unavailable: "暂不可估算",
    true: "是",
    false: "否",
    production: "生产环境",
    development: "开发环境",
    test: "测试环境",
  };
  return map[v] ?? v;
}

function eventLabel(v: string | null | undefined): string {
  const raw = String(v ?? "").trim();
  const map: Record<string, string> = {
    home_viewed: "浏览首页",
    world_selected: "选择世界",
    character_create_started: "开始创建角色",
    character_create_success: "创建角色成功",
    enter_main_game: "进入游戏",
    first_effective_action: "首次有效行动",
    third_effective_action: "第三次有效行动",
    save_created: "创建存档",
    settlement_submitted: "提交结算",
    feedback_submitted: "提交反馈",
      chat_request_finished: "完成一次 AI 回合",
      chat_action_completed: "完成一次行动",
      survey_submitted: "提交问卷",
      chapter_entered: "进入章节",
      chapter_completed: "完成章节",
      chapter_abandoned: "放弃章节",
      npc_interaction_started: "开始 NPC 互动",
      npc_interaction_completed: "完成 NPC 互动",
      npc_interaction_failed: "NPC 互动失败",
      regen_clicked: "点击重生成",
      retry_clicked: "点击重试",
      narrative_eval_sampled: "叙事评估采样",
    };
  return map[raw] ?? (raw.includes("_") ? "后台记录事件" : raw || "未知事件");
}

function auditActionLabel(v: string): string {
  const map: Record<string, string> = {
    admin_ai_insight_refresh: "刷新 AI 运营分析",
    admin_ai_insight_cache_clear: "清理 AI 分析缓存",
    admin_cron_rebuild_daily: "定时重建每日指标",
    admin_rebuild_daily: "手动重建每日指标",
  };
  return map[v] ?? (v.includes("_") ? "后台操作" : v);
}

function displayActorName(row: Pick<UserRow, "name" | "actorType" | "actorKey">): string {
  if (row.actorType === "guest") {
    const fromName = String(row.name ?? "").trim();
    if (fromName && !fromName.startsWith("guest:") && !fromName.startsWith("g:")) return fromName;
    const suffix = row.actorKey.replace(/^g:/, "").replace(/-/g, "").slice(-4);
    return suffix ? `游客 ${suffix}` : "游客";
  }
  return String(row.name ?? "").trim() || "未命名账号";
}

function shortActorCode(actorKey: string): string {
  const clean = actorKey.replace(/^[ug]:/, "").replace(/-/g, "");
  if (!clean) return "未记录";
  return `尾号 ${clean.slice(-6)}`;
}

function riskTagLabel(tag: string): string {
  const map: Record<string, string> = {
    high_ai_cost: "AI 用量偏高",
    wait_too_long: "等待过长",
    stuck_before_first_action: "首行动前卡住",
    survey_negative: "问卷负向",
    feedback_negative: "反馈负向",
    save_anxiety: "存档焦虑",
    content_quality_risk: "内容质量风险",
  };
  return map[tag] ?? tag;
}

function Card({ title, value, meta, degraded }: { title: string; value: string; meta?: string; degraded?: boolean }) {
  return (
    <div className="rounded-lg border border-[#d8d0c3] bg-[#fffaf0]/88 p-4 shadow-[0_10px_24px_rgba(38,57,49,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-[#68746c]">{title}</p>
        {degraded ? <span className="rounded-full border border-[#c4914a]/35 bg-[#fff2cf] px-2 py-0.5 text-[11px] text-[#7a4e15]">降级</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-[#123f39]">{value}</p>
      {meta ? (
        <details className="mt-2 text-xs leading-relaxed text-[#68746c]">
          <summary className="cursor-pointer text-[#335c54]">查看说明</summary>
          <p className="mt-1">{meta}</p>
        </details>
      ) : null}
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  if (kpis.length === 0) {
    return <div className="rounded-lg border border-[#d8d0c3] bg-[#fffaf0]/80 p-5 text-sm text-[#68746c]">暂无可用指标，接口可能处于局部降级状态。</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => (
        <div key={`${k.metricId}:${k.label}:${k.unit ?? ""}`} className="rounded-lg border border-[#d8d0c3] bg-[#fffaf0]/88 p-4 shadow-[0_10px_24px_rgba(38,57,49,0.08)]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-[#68746c]">{k.label}</p>
            {k.degraded ? <span className="rounded-full border border-[#c4914a]/35 bg-[#fff2cf] px-2 py-0.5 text-[11px] text-[#7a4e15]">降级</span> : null}
          </div>
          <p className="mt-2 text-2xl font-semibold text-[#123f39]">{fmt(k.value, k.unit)}</p>
          <details className="mt-3 text-xs text-[#68746c]">
            <summary className="cursor-pointer text-[#335c54]">查看技术明细</summary>
            <p className="mt-2 leading-relaxed">{k.definition}</p>
            <p className="mt-1">来源：{sourceLabel(k.source)}</p>
            <p className="mt-1">更新时间：{time(k.updatedAt)}</p>
            {k.reason ? <p className="mt-1 text-[#7a4e15]">状态：{reasonLabel(k.reason)}</p> : null}
          </details>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div>
      <h2 className="vc-reading-serif text-2xl font-semibold leading-none text-[#123f39]">{title}</h2>
      {meta ? <p className="mt-2 text-sm text-[#68746c]">{meta}</p> : null}
    </div>
  );
}

function Panel({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="rounded-lg border border-[#d8d0c3] bg-[#fffaf0]/82 p-4 shadow-[0_12px_28px_rgba(38,57,49,0.08)]">
      {children}
    </section>
  );
}

async function fetchEnvelope<T>(url: string, init?: RequestInit): Promise<{ env: AdminApiEnvelope<T>; status: number }> {
  const res = await fetch(url, { credentials: "include", ...init });
  return { env: await readAdminResponseJson<T>(res), status: res.status };
}

export default function AdminDashboardV2({ onlineCount, totalUsers, totalTokens }: Props) {
  const [tab, setTab] = useState<Tab>("总览");
  const [range, setRange] = useState<Range>("7d");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<OverviewData>(null);
  const [journey, setJourney] = useState<JourneyData>(null);
  const [aiExperience, setAiExperience] = useState<AiExperienceData>(null);
  const [contentQuality, setContentQuality] = useState<ContentQualityData>(null);
  const [surveyAggregate, setSurveyAggregate] = useState<SurveyAggregateData>(null);
  const [eventHealth, setEventHealth] = useState<EventHealthData>(null);
  const [health, setHealth] = useState<HealthData>(null);
  const [users, setUsers] = useState<UsersData>(null);
  const [userDetail, setUserDetail] = useState<UserDetail>(null);
  const [audit, setAudit] = useState<AuditData>(null);
  const [aiReport, setAiReport] = useState<AiReport>(null);
  const [degraded, setDegraded] = useState<Record<string, string | null>>({});
  const [userCursor, setUserCursor] = useState<string | null>(null);
  const [userCursorStack, setUserCursorStack] = useState<Array<string | null>>([null]);
  const [userSearch, setUserSearch] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [actorType, setActorType] = useState<"all" | "registered" | "guest">("all");
  const [sort, setSort] = useState<"lastActive" | "tokens" | "playTime">("lastActive");
  const [journeyActorType, setJourneyActorType] = useState<"all" | "registered" | "guest">("all");
  const [journeyPlatform, setJourneyPlatform] = useState<"all" | "pc" | "mobile">("all");
  const [journeyMode, setJourneyMode] = useState<"strict" | "any_order">("strict");
  const [rebuildDays, setRebuildDays] = useState(3);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [aiRefreshing, setAiRefreshing] = useState(false);

  const loadCore = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const nextDegraded: Record<string, string | null> = {};
    try {
      const [ov, j, ai, cq, survey, eh, h, au] = await Promise.all([
        fetchEnvelope<OverviewData>(`/api/admin/overview?range=${range}`),
        fetchEnvelope<JourneyData>(`/api/admin/player-journey?range=${range}&actorType=${journeyActorType}&platform=${journeyPlatform}&mode=${journeyMode}`),
        fetchEnvelope<AiExperienceData>(`/api/admin/ai-experience?range=${range}`),
        fetchEnvelope<ContentQualityData>(`/api/admin/content-quality?range=${range}`),
        fetchEnvelope<SurveyAggregateData>(`/api/admin/survey-aggregate?range=${range}`),
        fetchEnvelope<EventHealthData>(`/api/admin/event-health?range=${range}`),
        fetchEnvelope<HealthData>("/api/admin/system-health"),
        fetchEnvelope<AuditData>("/api/admin/audit-logs?limit=20"),
      ]);
      for (const [key, item] of Object.entries({ overview: ov, journey: j, ai, content: cq, survey, eventHealth: eh, health: h, audit: au })) {
        if (item.status === 403) {
          window.location.href = "/saiduhsa";
          return;
        }
        if (!item.env.ok || item.env.degraded) nextDegraded[key] = item.env.reason ?? "degraded";
      }
      if (ov.env.data) setOverview(ov.env.data);
      if (j.env.data) setJourney(j.env.data);
      if (ai.env.data) setAiExperience(ai.env.data);
      if (cq.env.data) setContentQuality(cq.env.data);
      if (survey.env.data) setSurveyAggregate(survey.env.data);
      if (eh.env.data) setEventHealth(eh.env.data);
      if (h.env.data) setHealth(h.env.data);
      if (au.env.data) setAudit(au.env.data);
      setDegraded(nextDegraded);
    } finally {
      setRefreshing(false);
    }
  }, [journeyActorType, journeyMode, journeyPlatform, range]);

  const loadUsers = useCallback(async (cursor: string | null) => {
    const params = new URLSearchParams();
    params.set("limit", "20");
    params.set("actorType", actorType);
    params.set("sort", sort);
    if (cursor) params.set("cursor", cursor);
    if (userSearch.trim()) params.set("search", userSearch.trim());
    if (onlyOnline) params.set("onlyOnline", "1");
    const { env, status } = await fetchEnvelope<UsersData>(`/api/admin/users?${params.toString()}`);
    if (status === 403) {
      window.location.href = "/saiduhsa";
      return;
    }
    if (env.data) setUsers(env.data);
    if (!env.ok || env.degraded) setDegraded((d) => ({ ...d, users: env.reason ?? "degraded" }));
  }, [actorType, onlyOnline, sort, userSearch]);

  useEffect(() => {
    void loadCore(false);
  }, [loadCore]);

  useEffect(() => {
    setUserCursor(null);
    setUserCursorStack([null]);
  }, [actorType, onlyOnline, sort, userSearch]);

  useEffect(() => {
    void loadUsers(userCursor);
  }, [loadUsers, userCursor]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void loadCore(true);
      void loadUsers(userCursor);
    }, 15000);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadCore, loadUsers, userCursor]);

  const overviewCards = overview?.cards ?? {};
  const capacity = health?.capacity;
  const totalOnline = Number(capacity?.online?.total ?? overviewCards.online ?? onlineCount ?? 0);
  const degradedList = useMemo(() => Object.entries(degraded).filter(([, reason]) => reason), [degraded]);
  const contentValidatorIssues = contentQuality?.validatorIssues;
  const contentValidatorIssueTotal = Number(contentValidatorIssues?.total ?? contentQuality?.validatorIssueCount ?? 0);
  const contentValidatorIssueByCode = contentValidatorIssues?.byCode ?? [];
  const contentChapterRank = contentQuality?.chapters?.rank ?? [];
  const contentNpcRank = contentQuality?.npcInteractions?.rank ?? [];
  const surveyFunnel = surveyAggregate?.completionFunnel ?? [];
  const surveyQuestionDropoff = surveyAggregate?.perQuestionDropoff ?? [];
  const surveyThemes = surveyAggregate?.textThemes ?? [];
  const surveyLowRatingSamples = surveyAggregate?.lowRatingSamples ?? [];
  const surveyRecommendDistribution = surveyAggregate?.recommendScoreDistribution ?? [];

  async function refreshAiReport() {
    setAiRefreshing(true);
    try {
      const { env, status } = await fetchEnvelope<AiReport>(`/api/admin/ai-insights?range=${range}`, { method: "POST" });
      if (status === 403) {
        window.location.href = "/saiduhsa";
        return;
      }
      if (env.data) setAiReport(env.data);
      if (!env.ok || env.degraded) setDegraded((d) => ({ ...d, aiAssistant: env.reason ?? "degraded" }));
    } finally {
      setAiRefreshing(false);
    }
  }

  async function clearAiCache() {
    const { env } = await fetchEnvelope<{ ok: boolean }>("/api/admin/ai-insights?refresh_cache=1", { method: "POST" });
    setDegraded((d) => ({ ...d, aiCache: env.ok ? null : env.reason ?? "cache_clear_failed" }));
  }

  async function openUserDetail(actorKey: string) {
    const { env, status } = await fetchEnvelope<UserDetail>(`/api/admin/users/${encodeURIComponent(actorKey)}`);
    if (status === 403) {
      window.location.href = "/saiduhsa";
      return;
    }
    if (env.data) setUserDetail(env.data);
    if (!env.ok || env.degraded) setDegraded((d) => ({ ...d, userDetail: env.reason ?? "degraded" }));
  }

  async function rebuildDailyMetrics() {
    const days = Math.max(1, Math.min(30, Math.trunc(rebuildDays || 3)));
    const { env, status } = await fetchEnvelope<{ ok: boolean; days: number; results: Array<{ ok: boolean }> }>(`/api/admin/rebuild-daily?days=${days}`, { method: "POST" });
    if (status === 403) {
      window.location.href = "/saiduhsa";
      return;
    }
    const failed = env.data?.results?.filter((r) => !r.ok).length ?? 0;
    setActionMessage(env.ok && !env.degraded ? `已重建最近 ${days} 天聚合。` : `重建完成但有 ${failed} 天失败。`);
    if (!env.ok || env.degraded) setDegraded((d) => ({ ...d, rebuildDaily: env.reason ?? "partial_rebuild_failed" }));
    await loadCore(true);
  }

  function nextUserPage() {
    if (!users?.nextCursor) return;
    setUserCursorStack((s) => [...s, users.nextCursor]);
    setUserCursor(users.nextCursor);
  }

  function prevUserPage() {
    setUserCursorStack((s) => {
      const next = s.slice(0, -1);
      const cursor = next[next.length - 1] ?? null;
      setUserCursor(cursor);
      return next.length > 0 ? next : [null];
    });
  }

  return (
    <main className="vc-reading-surface min-h-screen p-3 text-[#173f39] md:p-6" data-testid="admin-paper-shell">
      <section className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="border-b border-[#cfc6b7] pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-medium tracking-[0.22em] text-[#6c7771]">VERSECRAFT ADMIN</p>
              <h1 className="vc-reading-serif mt-2 text-4xl font-semibold leading-none text-[#123f39]">运营决策台</h1>
              <p className="mt-3 text-sm text-[#68746c]">
                注册用户 {Number(overviewCards.totalUsers ?? totalUsers).toLocaleString("zh-CN")} · 游客 {Number(overviewCards.guestsTotal ?? 0).toLocaleString("zh-CN")} · 当前在线 {totalOnline.toLocaleString("zh-CN")} · AI 用量 {Number(overviewCards.totalTokens ?? totalTokens).toLocaleString("zh-CN")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={range} onChange={(e) => setRange(e.target.value as Range)} className="rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-sm text-[#173f39]">
                <option value="today">今日</option>
                <option value="yesterday">昨日</option>
                <option value="7d">近 7 日</option>
                <option value="30d">近 30 日</option>
              </select>
              <button className="inline-flex items-center gap-2 rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-sm text-[#173f39] transition hover:bg-[#f7eddd]" onClick={() => void loadCore(true)}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "刷新中" : "刷新"}
              </button>
              <label className="inline-flex items-center gap-2 rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-xs text-[#173f39]">
                <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                自动刷新
              </label>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-sm text-[#173f39] transition hover:bg-[#f7eddd]"
                onClick={async () => {
                  await clearAdminShadowSession();
                  window.location.href = "/saiduhsa";
                }}
              >
                <LogOut className="h-4 w-4" />
                退出
              </button>
            </div>
          </div>
        </header>

        {degradedList.length > 0 ? (
          <div className="rounded-lg border border-[#c4914a]/35 bg-[#fff2cf] p-3 text-sm text-[#7a4e15]" role="status" data-testid="admin-degraded-banner">
            部分数据处于降级状态：{degradedList.map(([k, v]) => `${translateLooseLabel(k)}：${reasonLabel(v)}`).join("；")}
          </div>
        ) : null}

        <nav className="flex gap-2 overflow-x-auto border-b border-[#d8d0c3] pb-2">
          {TABS.map((x) => {
            const Icon = tabIcons[x];
            return (
              <button
                key={x}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${tab === x ? "bg-[#174d46] text-[#fffaf0] shadow-[0_8px_18px_rgba(23,77,70,0.18)]" : "bg-[#fffaf0]/80 text-[#335c54] hover:bg-[#f7eddd]"}`}
                onClick={() => setTab(x)}
              >
                <Icon className="h-4 w-4" />
                {x}
              </button>
            );
          })}
        </nav>

        {tab === "总览" ? (
          <section className="space-y-4">
            <KpiGrid kpis={overview?.kpis ?? []} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Card title="当前在线" value={totalOnline.toLocaleString("zh-CN")} meta={`注册 ${fmt(capacity?.online?.registered)}，游客 ${fmt(capacity?.online?.guests)}，窗口 ${capacity?.online?.windowSeconds ?? 90} 秒。`} />
              <Card title="预计即时承载余量" value={capacity?.estimate?.remainingConcurrentActions == null ? "暂无法可靠估算" : `${capacity.estimate.remainingConcurrentActions.toLocaleString("zh-CN")} 个行动`} meta={capacity?.estimate?.explanation ?? "等待系统健康数据返回。"} degraded={capacity?.estimate?.status === "unavailable" || capacity?.estimate?.status === "sample_insufficient"} />
              <Card title="DAU / WAU / MAU" value={`${fmt(overviewCards.dau)} / ${fmt(overviewCards.wau)} / ${fmt(overviewCards.mau)}`} meta="来源：每日运营聚合。" />
              <Card title="区间游玩时长" value={formatDurationSeconds(Number(overviewCards.playDurationRangeSec ?? 0)) || "暂无记录"} meta="来源：在线心跳与每日聚合。" />
              <Card title="反馈量" value={fmt(overviewCards.feedbackCountRange)} meta="来源：玩家反馈与行为事件记录。" />
              <Card title="注册用户总数" value={fmt(overviewCards.totalUsers ?? totalUsers)} />
              <Card title="游客总数" value={fmt(overviewCards.guestsTotal)} />
              <Card title="今日 AI 用量" value={fmt(overviewCards.todayTokenCost)} />
            </div>
          </section>
        ) : null}

        {tab === "玩家旅程" ? (
          <Panel>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionTitle title="玩家旅程漏斗" meta={`样本 ${journey?.sampleSize ?? 0} · ${journey?.evidenceSufficiency === "insufficient" ? "样本不足" : "样本可用"} · 更新时间 ${time(journey?.updatedAt)}`} />
              <div className="flex flex-wrap gap-2">
                <select value={journeyActorType} onChange={(e) => setJourneyActorType(e.target.value as typeof journeyActorType)} className="rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-sm">
                  <option value="all">全部身份</option>
                  <option value="registered">注册用户</option>
                  <option value="guest">游客</option>
                </select>
                <select value={journeyPlatform} onChange={(e) => setJourneyPlatform(e.target.value as typeof journeyPlatform)} className="rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-sm">
                  <option value="all">全部设备</option>
                  <option value="mobile">移动端</option>
                  <option value="pc">电脑端</option>
                </select>
                <select value={journeyMode} onChange={(e) => setJourneyMode(e.target.value as typeof journeyMode)} className="rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-sm">
                  <option value="strict">严格顺序</option>
                  <option value="any_order">任意顺序</option>
                </select>
              </div>
            </div>
            <div className="space-y-3">
              {(journey?.stages ?? []).length === 0 ? <p className="text-sm text-[#68746c]">暂无旅程样本。</p> : null}
              {(journey?.stages ?? []).map((s) => (
                <div key={s.eventName} className={`rounded-lg border p-3 ${s.isBiggestDrop ? "border-[#c4914a] bg-[#fff2cf]" : "border-[#e1d8ca] bg-[#fffdf8]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-[#173f39]">
                      {s.label || eventLabel(s.eventName)}
                      {s.isBiggestDrop ? <span className="ml-2 rounded-full bg-[#c4914a] px-2 py-0.5 text-[11px] text-[#fffaf0]">最大流失</span> : null}
                    </span>
                    <span className="text-[#68746c]">
                      {s.count.toLocaleString("zh-CN")} 人 · 相邻 {percent(s.stepConversionRate)} · 总 {percent(s.totalConversionRate)} · 流失 {Number(s.dropOffCount ?? 0).toLocaleString("zh-CN")} / {percent(s.dropOffRate)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#e7decf]">
                    <div className="h-2 rounded-full bg-[#174d46]" style={{ width: `${Math.max(1, Math.min(100, s.totalConversionRate * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {tab === "AI 体验" ? (
          <section className="space-y-4">
            <KpiGrid kpis={aiExperience?.metrics ?? []} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Card title="AI 成功率" value={percent(aiExperience?.rates?.successRate)} meta={`样本 ${aiExperience?.sampleSize ?? 0}`} />
              <Card title="失败率" value={percent(aiExperience?.rates?.failureRate)} />
              <Card title="兜底率" value={percent(aiExperience?.rates?.fallbackRate)} />
              <Card title="结果格式异常率" value={percent(aiExperience?.rates?.parseFailureRate)} />
              <Card title="请求被限流率" value={percent(aiExperience?.rates?.rateLimitRate)} meta={`被限流 ${fmt(aiExperience?.rateLimitCount)} 次`} degraded={(aiExperience?.rateLimitCount ?? 0) > 0} />
              <Card title="总 AI 用量" value={fmt(aiExperience?.cost?.totalTokens)} />
              <Card title="每次行动 AI 用量" value={fmt(Math.round(aiExperience?.cost?.tokenPerEffectiveAction ?? 0))} />
              <Card title="每位活跃玩家 AI 用量" value={fmt(Math.round(aiExperience?.cost?.tokenPerActiveActor ?? 0))} />
              <Card title="排队情况" value="暂未单独记录" meta="当前仅展示聊天队列深度与承载余量。" degraded />
            </div>
            <Panel>
              <SectionTitle title="高 AI 用量行动来源" meta="按真实 AI 消耗事件聚合；样本不足时不做异常判断。" />
              <div className="mt-3 grid gap-2">
                {(aiExperience?.cost?.highCostActors ?? []).length === 0 ? <p className="text-sm text-[#68746c]">暂无样本。</p> : null}
                {(aiExperience?.cost?.highCostActors ?? []).map((x) => (
                  <div key={x.actorKey} className="flex items-center justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                    <span className="truncate">{shortActorCode(x.actorKey)}</span>
                    <span>{x.tokens.toLocaleString("zh-CN")} 点 / {x.actions} 次</span>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        ) : null}

        {tab === "内容质量" ? (
          <section className="space-y-4">
            {contentQuality?.evidenceSufficiency === "insufficient" ? (
              <div className="rounded-lg border border-[#c4914a]/35 bg-[#fff2cf] p-3 text-sm text-[#7a4e15]">
                内容质量样本不足：当前最大样本 {fmt(contentQuality?.sampleSize)}，只展示采样缺口，不判断趋势。
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Card title="世界首行动率" value={percent(contentQuality?.worldFirstActionRate)} meta={`世界选择 ${fmt(contentQuality?.worldSelections?.reduce((sum, x) => sum + Number(x.count ?? 0), 0))}`} />
              <Card title="章节完成率" value={percent(contentQuality?.chapters?.completionRate)} meta={`进入 ${fmt(contentQuality?.chapters?.entered?.reduce((sum, x) => sum + Number(x.count ?? 0), 0))}`} degraded={contentQuality?.chapters?.evidenceSufficiency === "insufficient"} />
              <Card title="NPC 互动完成率" value={percent(contentQuality?.npcInteractions?.completionRate)} meta={`失败率 ${percent(contentQuality?.npcInteractions?.failureRate)}`} />
              <Card title="重试 / 重生成" value={fmt(contentQuality?.retryRegenerationCount)} meta={`retry ${fmt(contentQuality?.retryRegeneration?.retryCount)} · regen ${fmt(contentQuality?.retryRegeneration?.regenCount)}`} />
              <Card title="规则冲突" value={fmt(contentValidatorIssueTotal)} meta={`${contentValidatorIssueByCode.length} 类 issue`} />
              <Card title="负反馈率" value={percent(contentQuality?.negativeFeedbackRate)} meta={`反馈样本 ${fmt(contentQuality?.feedbackSampleSize)}，问卷样本 ${fmt(contentQuality?.surveySampleSize)}`} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel>
                <SectionTitle title="世界排行" meta={`更新时间 ${time(contentQuality?.updatedAt)}`} />
                <div className="mt-3 space-y-2">
                  {(contentQuality?.worldSelections ?? []).length === 0 ? <p className="text-sm text-[#68746c]">暂无世界选择样本。</p> : null}
                  {(contentQuality?.worldSelections ?? []).map((w) => (
                    <div key={w.worldId} className="flex items-center justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                      <div>
                        <p className="font-medium text-[#173f39]">{w.worldId === "unknown" ? "未记录世界" : w.worldId}</p>
                        <p className="text-xs text-[#68746c]">首行动 {fmt(w.firstActionCount)} / {percent(w.firstActionRate)}</p>
                      </div>
                      <span>{fmt(w.count)}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <SectionTitle title="章节完成率" meta="按 chapter_entered / completed / abandoned 聚合。" />
                <div className="mt-3 space-y-2">
                  {contentChapterRank.length === 0 ? <p className="text-sm text-[#68746c]">暂无章节样本。</p> : null}
                  {contentChapterRank.slice(0, 8).map((c) => (
                    <div key={`${c.worldId}:${c.chapterId}`} className="rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-[#173f39]">{c.chapterId}</span>
                        <span>{percent(c.completionRate)} 完成 · {percent(c.abandonRate)} 放弃</span>
                      </div>
                      <p className="mt-1 text-xs text-[#68746c]">进入 {fmt(c.entered)} · 完成 {fmt(c.completed)} · 放弃 {fmt(c.abandoned)} · {c.worldId}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel>
                <SectionTitle title="NPC 互动排行" meta="按 started / completed / failed 聚合。" />
                <div className="mt-3 space-y-2">
                  {contentNpcRank.length === 0 ? <p className="text-sm text-[#68746c]">暂无 NPC 互动样本。</p> : null}
                  {contentNpcRank.slice(0, 8).map((n) => (
                    <div key={n.npcId} className="rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-[#173f39]">{n.npcId}</span>
                        <span>{percent(n.completionRate)} 完成</span>
                      </div>
                      <p className="mt-1 text-xs text-[#68746c]">开始 {fmt(n.started)} · 完成 {fmt(n.completed)} · 失败 {fmt(n.failed)} · 失败率 {percent(n.failureRate)}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <SectionTitle title="规则冲突分类" meta="validator / safety / entity / pacing issue code 聚合。" />
                <div className="mt-3 space-y-2">
                  {contentValidatorIssueByCode.length === 0 ? <p className="text-sm text-[#68746c]">暂无规则冲突样本。</p> : null}
                  {contentValidatorIssueByCode.slice(0, 10).map((item) => (
                    <div key={item.code} className="flex justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                      <span className="font-mono text-xs text-[#173f39]">{item.code}</span>
                      <span>{fmt(item.count)}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel>
              <SectionTitle title="反馈与问卷主题" meta="负反馈率仍来自 feedbacks，问卷样本来自 survey_responses。" />
              <div className="mt-3 space-y-2">
                {(contentQuality?.feedbackTopics ?? []).slice(0, 6).map((t) => (
                  <div key={String(t.topic)} className="flex justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                    <span>{String(t.topic || "未分类反馈")}</span>
                    <span>{fmt(t.count)}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <SectionTitle
                title="问卷分析"
                meta={
                  surveyAggregate?.evidenceSufficiency === "insufficient"
                    ? "样本不足：展示原始计数与抱怨主题，不判断趋势。"
                    : `站内问卷样本 ${fmt(surveyAggregate?.totalResponses)}`
                }
              />
              {degraded.survey ? (
                <div className="mt-3 rounded-lg border border-[#c4914a]/35 bg-[#fff2cf] p-3 text-sm text-[#7a4e15]">
                  问卷分析降级：{reasonLabel(degraded.survey)}
                </div>
              ) : null}
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <Card title="问卷提交数" value={fmt(surveyAggregate?.totalResponses)} meta="survey_responses" degraded={surveyAggregate?.evidenceSufficiency === "insufficient"} />
                <Card title="主题样本" value={fmt(surveyThemes.reduce((sum, item) => sum + Number(item.count ?? 0), 0))} meta={`${surveyThemes.length} 类抱怨`} />
                <Card title="低评分样本" value={fmt(surveyLowRatingSamples.length)} meta="摘要已截断并脱敏" />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <SectionTitle title="完成漏斗" meta="按 actor 去重统计 survey_* 事件。" />
                  <div className="mt-3 space-y-2">
                    {surveyFunnel.length === 0 ? <p className="text-sm text-[#68746c]">暂无问卷事件样本。</p> : null}
                    {surveyFunnel.map((item) => (
                      <div key={item.eventName} className="rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-[#173f39]">{item.label || eventLabel(item.eventName)}</span>
                          <span>{fmt(item.count)}</span>
                        </div>
                        <p className="mt-1 text-xs text-[#68746c]">
                          上一步转化 {percent(item.stepConversionRate)} · 总转化 {percent(item.totalConversionRate)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <SectionTitle title="每题流失" meta="step_viewed 到下一题或提交尝试。" />
                  <div className="mt-3 space-y-2">
                    {surveyQuestionDropoff.length === 0 ? <p className="text-sm text-[#68746c]">暂无题目浏览样本。</p> : null}
                    {surveyQuestionDropoff.slice(0, 10).map((item) => (
                      <div key={item.questionId} className="rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-[#173f39]">{item.title}</span>
                          <span>{percent(item.dropOffRate)}</span>
                        </div>
                        <p className="mt-1 text-xs text-[#68746c]">
                          浏览 {fmt(item.viewed)} · 进入下一步 {fmt(item.nextCount)} · 流失 {fmt(item.dropOffCount)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div>
                  <SectionTitle title="主题排行" meta="开放文本本地规则聚类。" />
                  <div className="mt-3 space-y-2">
                    {surveyThemes.length === 0 ? <p className="text-sm text-[#68746c]">暂无开放文本主题。</p> : null}
                    {surveyThemes.map((item) => (
                      <div key={item.theme} className="flex justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                        <span>{item.theme}</span>
                        <span>{fmt(item.count)} · {item.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <SectionTitle title="推荐意愿" meta="优先使用 recommendScore，其次问卷选项。" />
                  <div className="mt-3 space-y-2">
                    {surveyRecommendDistribution.length === 0 ? <p className="text-sm text-[#68746c]">暂无推荐意愿样本。</p> : null}
                    {surveyRecommendDistribution.slice(0, 8).map((item) => (
                      <div key={item.bucket} className="flex justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                        <span>{item.label}</span>
                        <span>{fmt(item.count)} · {item.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <SectionTitle title="分群" meta="注册/游客、平台、体验阶段。" />
                  <div className="mt-3 space-y-2">
                    {(surveyAggregate?.segmentBreakdown?.actorType ?? []).map((item) => (
                      <div key={`actor:${item.segment}`} className="flex justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                        <span>{item.segment === "registered" ? "注册用户" : item.segment === "guest" ? "游客" : "未知身份"}</span>
                        <span>{fmt(item.count)} · {item.pct}%</span>
                      </div>
                    ))}
                    {(surveyAggregate?.segmentBreakdown?.platform ?? []).slice(0, 3).map((item) => (
                      <div key={`platform:${item.segment}`} className="flex justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                        <span>{item.segment}</span>
                        <span>{fmt(item.count)} · {item.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <SectionTitle title="低评分样本" meta="不展示完整原文，只展示 120 字内脱敏摘要。" />
                <div className="mt-3 space-y-2">
                  {surveyLowRatingSamples.length === 0 ? <p className="text-sm text-[#68746c]">暂无低评分样本。</p> : null}
                  {surveyLowRatingSamples.slice(0, 8).map((item, idx) => (
                    <div key={`${item.createdAt ?? "sample"}:${idx}`} className="rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                      <div className="flex items-center justify-between gap-3 text-xs text-[#68746c]">
                        <span>满意度 {item.overallRating ?? "未填"} · 推荐 {item.recommendScore ?? "未填"} · {item.experienceStage}</span>
                        <span>{time(item.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-[#173f39]">{item.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </section>
        ) : null}

        {tab === "数据质量" ? (
          <section className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Card title="总事件数" value={fmt(eventHealth?.totalEvents)} meta={`更新：${time(eventHealth?.updatedAt)}`} degraded={eventHealth?.evidenceSufficiency === "insufficient"} />
              <Card title="缺 actor 率" value={percent(eventHealth?.rates?.missingActorRate)} meta={`${fmt(eventHealth?.missingActorCount)} 条缺 actor_id`} />
              <Card title="anon_session 率" value={percent(eventHealth?.rates?.anonSessionRate)} meta={`${fmt(eventHealth?.anonSessionCount)} 条仍落在匿名会话`} />
              <Card title="unknown platform 率" value={percent(eventHealth?.rates?.unknownPlatformRate)} meta={`${fmt(eventHealth?.unknownPlatformCount)} 条未识别设备`} />
              <Card title="缺 guest 率" value={percent(eventHealth?.rates?.missingGuestRate)} meta={`${fmt(eventHealth?.missingGuestCount)} 条游客身份不完整`} />
              <Card title="契约异常率" value={percent(eventHealth?.rates?.invalidContractRate)} meta={`${fmt(eventHealth?.invalidContractCount)} 条事件不满足 tracking plan`} />
              <Card title="缺 worldId 率" value={percent(eventHealth?.rates?.missingWorldIdRate)} meta={`${fmt(eventHealth?.missingWorldIdCount)} 条关键事件缺世界字段`} />
              <Card title="缺 chapterId 率" value={percent(eventHealth?.rates?.missingChapterIdRate)} meta={`${fmt(eventHealth?.missingChapterIdCount)} 条回合/存档事件缺章节字段`} />
            </div>

            {degraded.eventHealth ? (
              <div className="rounded-lg border border-[#c4914a]/35 bg-[#fff2cf] p-3 text-sm text-[#7a4e15]">
                数据质量面板降级：{reasonLabel(degraded.eventHealth)}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel>
                <SectionTitle title="核心事件覆盖" meta={eventHealth?.evidenceSufficiency === "insufficient" ? "样本不足，只显示覆盖情况，不判断趋势。" : "核心漏斗事件是否在当前区间出现。"} />
                <div className="mt-3 space-y-2">
                  {(eventHealth?.eventCoverage ?? []).length === 0 ? <p className="text-sm text-[#68746c]">暂无事件样本。</p> : null}
                  {(eventHealth?.eventCoverage ?? []).map((item) => (
                    <div key={item.eventName} className="flex items-center justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                      <div>
                        <p className="font-medium text-[#173f39]">{eventLabel(item.eventName)}</p>
                        <p className="text-xs text-[#68746c]">{item.eventName}</p>
                      </div>
                      <div className="text-right">
                        <p className={item.covered ? "text-[#0d6b55]" : "text-[#9f2f2f]"}>{item.covered ? "已覆盖" : "缺失"}</p>
                        <p className="text-xs text-[#68746c]">{item.count.toLocaleString("zh-CN")} 条</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <SectionTitle title="Top missing properties" meta="按事件契约与数据质量规则聚合，只展示字段名和计数。" />
                <div className="mt-3 space-y-2">
                  {(eventHealth?.topMissingProperties ?? []).length === 0 ? <p className="text-sm text-[#68746c]">当前区间没有明显字段缺口。</p> : null}
                  {(eventHealth?.topMissingProperties ?? []).map((item) => (
                    <div key={`${item.property}:${item.eventName ?? "all"}`} className="flex items-center justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                      <span className="font-mono text-xs text-[#173f39]">{item.property}</span>
                      <span>{item.count.toLocaleString("zh-CN")} 条</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel>
                <SectionTitle title="契约异常事件" meta="用于定位埋点缺字段、未知事件名或敏感字段风险。" />
                <div className="mt-3 space-y-2">
                  {(eventHealth?.topInvalidEvents ?? []).length === 0 ? <p className="text-sm text-[#68746c]">当前区间没有契约异常事件。</p> : null}
                  {(eventHealth?.topInvalidEvents ?? []).map((item) => (
                    <div key={item.eventName} className="rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span>{eventLabel(item.eventName)}</span>
                        <span>{item.count.toLocaleString("zh-CN")} 条</span>
                      </div>
                      <p className="mt-1 text-xs text-[#68746c]">
                        {(item.reasons ?? []).map((r) => `${r.reason}:${r.count}`).join(" / ") || "unknown"}
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <SectionTitle title="事件量 Top" meta="用于判断当前样本主要来自哪些事件。" />
                <div className="mt-3 space-y-2">
                  {(eventHealth?.eventsByName ?? []).length === 0 ? <p className="text-sm text-[#68746c]">暂无事件样本。</p> : null}
                  {(eventHealth?.eventsByName ?? []).slice(0, 12).map((item) => (
                    <div key={item.eventName} className="flex items-center justify-between rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">
                      <span>{eventLabel(item.eventName)}</span>
                      <span>{item.count.toLocaleString("zh-CN")} 条</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </section>
        ) : null}

        {tab === "玩家 / 游客" ? (
          <Panel testId="admin-user-table-panel">
            <div className="mb-3 flex flex-wrap gap-2">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b877e]" />
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="搜索账号名或识别尾号" className="w-full rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-9 py-2 text-sm" />
              </label>
              <select value={actorType} onChange={(e) => setActorType(e.target.value as typeof actorType)} className="rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-sm">
                <option value="all">全部身份</option>
                <option value="registered">注册用户</option>
                <option value="guest">游客</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-sm">
                <option value="lastActive">最近活跃</option>
                <option value="tokens">AI 用量</option>
                <option value="playTime">游玩时长</option>
              </select>
              <label className="inline-flex items-center gap-2 rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-xs">
                <input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} />
                仅在线
              </label>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#d8d0c3]">
              <table className="min-w-full border-collapse bg-[#fffdf8] text-sm">
                <thead className="bg-[#f2eadc] text-left text-xs text-[#68746c]">
                  <tr>
                    <th className="px-3 py-2 font-medium">账号</th>
                    <th className="px-3 py-2 font-medium">身份</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">AI 用量</th>
                    <th className="px-3 py-2 font-medium">游玩时长</th>
                    <th className="px-3 py-2 font-medium">最近活跃</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(users?.rows ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-5 text-center text-[#68746c]">暂无用户数据或接口降级。</td>
                    </tr>
                  ) : null}
                  {(users?.rows ?? []).map((u) => (
                    <tr key={u.actorKey} className="border-t border-[#e1d8ca]">
                      <td className="px-3 py-2">
                        <p className="font-medium text-[#173f39]">{displayActorName(u)}</p>
                        <p className="text-xs text-[#8b877e]">{shortActorCode(u.actorKey)}</p>
                      </td>
                      <td className="px-3 py-2">{actorTypeLabel(u.actorType)}</td>
                      <td className={`px-3 py-2 ${u.isOnline ? "text-[#0d6b55]" : "text-[#8b877e]"}`}>{u.isOnline ? "在线" : "离线"}</td>
                      <td className="px-3 py-2">{u.tokensUsed.toLocaleString("zh-CN")}</td>
                      <td className="px-3 py-2">{formatDurationSeconds(u.playTime) || "暂无记录"}</td>
                      <td className="px-3 py-2">{time(u.lastActive)}</td>
                      <td className="px-3 py-2">
                        <button className="rounded-lg bg-[#174d46] px-3 py-1.5 text-xs text-[#fffaf0]" onClick={() => void openUserDetail(u.actorKey)}>查看</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {userDetail ? (
              <div className="mt-4 rounded-lg border border-[#cfc6b7] bg-[#fffdf8] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="vc-reading-serif text-2xl font-semibold text-[#123f39]">{userDetail.basic?.name ?? "玩家详情"}</h3>
                    <p className="mt-1 text-xs text-[#68746c]">{actorTypeLabel(userDetail.basic?.actorType)} · {shortActorCode(userDetail.actorKey)} · 最近活跃 {time(userDetail.basic?.lastActive)}</p>
                  </div>
                  <button aria-label="关闭详情" className="rounded-lg border border-[#cfc6b7] bg-[#fffaf0] p-2" onClick={() => setUserDetail(null)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <Card title="累计 AI 用量" value={fmt(userDetail.basic?.tokensUsed)} />
                  <Card title="游玩时长" value={formatDurationSeconds(Number(userDetail.basic?.playTime ?? 0)) || "暂无记录"} />
                  <Card
                    title="漏斗阶段"
                    value={userDetail.journeyStage?.currentLabel ?? "暂无行为"}
                    meta={
                      userDetail.journeyStage?.nextLabel
                        ? `下一步：${userDetail.journeyStage.nextLabel}`
                        : userDetail.journeyStage?.status === "completed"
                          ? "已走完核心漏斗"
                          : "等待首个核心事件"
                    }
                    degraded={userDetail.journeyStage?.status === "no_events"}
                  />
                  <Card
                    title="AI 平均等待"
                    value={userDetail.aiExperience?.requestCount ? `${Math.round(Number(userDetail.aiExperience?.avgLatency ?? 0) / 1000)} 秒` : "暂无记录"}
                    meta={`失败 ${fmt(userDetail.aiExperience?.failureCount)} · 兜底 ${fmt(userDetail.aiExperience?.fallbackCount)} · 慢请求 ${fmt(userDetail.aiExperience?.slowRequestCount)}`}
                    degraded={(userDetail.aiExperience?.failureCount ?? 0) > 0 || (userDetail.aiExperience?.slowRequestCount ?? 0) > 0}
                  />
                  <Card
                    title="AI 用量"
                    value={`${fmt(userDetail.aiExperience?.tokenCost)} 点`}
                    meta={`AI 请求 ${fmt(userDetail.aiExperience?.requestCount)}`}
                    degraded={(userDetail.riskTags ?? []).includes("high_ai_cost")}
                  />
                  <Card title="最近战绩" value={(userDetail.recentSettlements?.[0]?.grade ?? "暂无记录").toString()} meta={userDetail.recentSettlements?.[0]?.maxFloorLabel ?? ""} />
                </div>
                <div className="mt-3 rounded-lg border border-[#e1d8ca] bg-[#fffaf0] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium">风险标签</h4>
                    {(userDetail.riskTags ?? []).length === 0 ? <span className="rounded-full border border-[#d8d0c3] bg-[#fffdf8] px-2 py-0.5 text-xs text-[#68746c]">暂无明显风险</span> : null}
                    {(userDetail.riskTags ?? []).map((tag) => (
                      <span key={tag} className="rounded-full border border-[#b86a4b]/35 bg-[#fff1e9] px-2 py-0.5 text-xs font-medium text-[#8d3f26]">
                        {riskTagLabel(tag)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-[#e1d8ca] bg-[#fffaf0] p-3">
                    <h4 className="font-medium">最近反馈</h4>
                    {(userDetail.recentFeedback ?? []).length === 0 ? <p className="mt-2 text-xs text-[#68746c]">暂无记录</p> : null}
                    {(userDetail.recentFeedback ?? []).map((x, idx) => (
                      <p key={`${x.createdAt}:${idx}`} className="mt-2 text-xs leading-relaxed text-[#335c54]">
                        {x.negative ? <span className="mr-1 rounded bg-[#fff1e9] px-1.5 py-0.5 text-[#8d3f26]">负向</span> : null}
                        {x.contentPreview || "未填写文本"}
                      </p>
                    ))}
                  </div>
                  <div className="rounded-lg border border-[#e1d8ca] bg-[#fffaf0] p-3">
                    <h4 className="font-medium">最近问卷</h4>
                    {(userDetail.recentSurvey ?? []).length === 0 ? <p className="mt-2 text-xs text-[#68746c]">暂无记录</p> : null}
                    {(userDetail.recentSurvey ?? []).map((x, idx) => (
                      <div key={`${x.createdAt}:${idx}`} className="mt-2 text-xs leading-relaxed text-[#335c54]">
                        <p>
                          {x.negative ? <span className="mr-1 rounded bg-[#fff1e9] px-1.5 py-0.5 text-[#8d3f26]">低分</span> : null}
                          {x.saveAnxiety ? <span className="mr-1 rounded bg-[#fff2cf] px-1.5 py-0.5 text-[#7a4e15]">存档焦虑</span> : null}
                          满意度 {x.overallRating ?? "未填"} · 推荐意愿 {x.recommendScore ?? "未填"}
                        </p>
                        {x.topFixPreview ? <p className="mt-1 text-[#68746c]">希望改进：{x.topFixPreview}</p> : null}
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-[#e1d8ca] bg-[#fffaf0] p-3">
                    <h4 className="font-medium">最近行为</h4>
                    {(userDetail.recentEvents ?? []).length === 0 ? <p className="mt-2 text-xs text-[#68746c]">暂无记录</p> : null}
                    {(userDetail.recentEvents ?? []).slice(0, 8).map((x, idx) => (
                      <p key={`${x.eventTime}:${idx}:${x.eventName}`} className="mt-2 text-xs leading-relaxed text-[#335c54]">
                        {eventLabel(x.eventName)} · {time(x.eventTime)}
                        {x.page ? <span className="text-[#68746c]"> · {x.page}</span> : null}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-[#e1d8ca] bg-[#fffaf0] p-3">
                    <h4 className="font-medium">世界路径</h4>
                    {(userDetail.contentPath?.worlds ?? []).length === 0 ? <p className="mt-2 text-xs text-[#68746c]">暂无记录</p> : null}
                    {(userDetail.contentPath?.worlds ?? []).slice(0, 5).map((x) => (
                      <p key={`${x.worldId}:${x.lastEventAt}`} className="mt-2 text-xs text-[#335c54]">
                        {translateLooseLabel(x.worldId)} · {fmt(x.count)} 次 · {time(x.lastEventAt)}
                      </p>
                    ))}
                  </div>
                  <div className="rounded-lg border border-[#e1d8ca] bg-[#fffaf0] p-3">
                    <h4 className="font-medium">章节路径</h4>
                    {(userDetail.contentPath?.chapters ?? []).length === 0 ? <p className="mt-2 text-xs text-[#68746c]">暂无记录</p> : null}
                    {(userDetail.contentPath?.chapters ?? []).slice(0, 5).map((x) => (
                      <p key={`${x.worldId}:${x.chapterId}`} className="mt-2 text-xs leading-relaxed text-[#335c54]">
                        {translateLooseLabel(x.chapterId)} · 进入 {fmt(x.entered)} / 完成 {fmt(x.completed)} / 放弃 {fmt(x.abandoned)}
                      </p>
                    ))}
                  </div>
                  <div className="rounded-lg border border-[#e1d8ca] bg-[#fffaf0] p-3">
                    <h4 className="font-medium">NPC 路径</h4>
                    {(userDetail.contentPath?.npcs ?? []).length === 0 ? <p className="mt-2 text-xs text-[#68746c]">暂无记录</p> : null}
                    {(userDetail.contentPath?.npcs ?? []).slice(0, 5).map((x) => (
                      <p key={x.npcId} className="mt-2 text-xs leading-relaxed text-[#335c54]">
                        {translateLooseLabel(x.npcId)} · 开始 {fmt(x.started)} / 完成 {fmt(x.completed)} / 失败 {fmt(x.failed)}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-[#e1d8ca] bg-[#fffaf0] p-3">
                  <h4 className="font-medium">建议动作</h4>
                  {(userDetail.suggestedOpsActions ?? []).length === 0 ? <p className="mt-2 text-xs text-[#68746c]">暂无建议</p> : null}
                  {(userDetail.suggestedOpsActions ?? []).map((action) => (
                    <p key={action} className="mt-2 text-xs leading-relaxed text-[#335c54]">{action}</p>
                  ))}
                  <p className="mt-2 text-[11px] text-[#8b877e]">数据口径：详情接口按 actorKey 查询，注册用户匹配 userId/actorId，游客匹配 guestId/actorId，事件时间线最多返回 30 条。</p>
                </div>
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between text-xs text-[#68746c]">
              <span>约 {users?.totalApprox ?? 0} 条 · 每页 {users?.limit ?? 20}</span>
              <div className="flex gap-2">
                <button aria-label="上一页" className="inline-flex items-center gap-1 rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-1.5 disabled:opacity-40" disabled={userCursorStack.length <= 1} onClick={prevUserPage}><ChevronLeft className="h-4 w-4" />上一页</button>
                <button aria-label="下一页" className="inline-flex items-center gap-1 rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-1.5 disabled:opacity-40" disabled={!users?.hasMore} onClick={nextUserPage}>下一页<ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </Panel>
        ) : null}

        {tab === "系统健康" ? (
          <section className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Card title="当前在线" value={fmt(capacity?.online?.total)} meta={`注册 ${fmt(capacity?.online?.registered)}，游客 ${fmt(capacity?.online?.guests)}。`} />
              <Card title="即时承载余量" value={capacity?.estimate?.remainingConcurrentActions == null ? "暂无法可靠估算" : `${capacity.estimate.remainingConcurrentActions.toLocaleString("zh-CN")} 个行动`} meta={capacity?.estimate?.explanation ?? "等待系统健康数据返回。"} degraded={capacity?.estimate?.status === "unavailable" || capacity?.estimate?.status === "sample_insufficient"} />
              <Card title="排队缓冲余量" value={capacity?.chatQueue?.remainingQueueSlots == null ? "暂未记录" : `${capacity.chatQueue.remainingQueueSlots.toLocaleString("zh-CN")} 个行动`} meta={`运行中 ${fmt(capacity?.chatQueue?.running)} / ${fmt(capacity?.chatQueue?.maxRunning)}，排队 ${fmt(capacity?.chatQueue?.queued)} / ${fmt(capacity?.chatQueue?.maxQueued)}。`} />
              <Card title="估算置信度" value={confidenceLabel(capacity?.estimate?.confidence)} meta={`近 1 小时 AI 回合样本 ${fmt(capacity?.evidence?.recentAiRequests)}。`} />
            </div>
            <Panel>
              <SectionTitle title="低风险运营动作" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-sm text-[#68746c]">重建最近</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={rebuildDays}
                  onChange={(e) => setRebuildDays(Number(e.target.value))}
                  className="w-20 rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-sm"
                />
                <span className="text-sm text-[#68746c]">天每日运营聚合</span>
                <button className="rounded-lg bg-[#174d46] px-3 py-2 text-sm font-medium text-[#fffaf0]" onClick={() => void rebuildDailyMetrics()}>
                  手动重建
                </button>
              </div>
              {actionMessage ? <p className="mt-2 text-sm text-[#0d6b55]">{actionMessage}</p> : null}
            </Panel>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(health?.checks ?? {}).map(([key, h]) => (
                <Card key={key} title={{ db: "数据库", redis: "缓存与限流", aiGateway: "AI 网关" }[key] ?? "后台检查"} value={h.ok ? "正常" : "降级"} meta={`状态：${reasonLabel(h.reason)} · 更新时间 ${time(h.updatedAt)}`} degraded={h.degraded} />
              ))}
              <Card title="最近定时重建" value={time(health?.cron?.lastRebuildAt)} />
              <Card title="聚合数据新鲜度" value={time(health?.aggregationFreshness)} />
              <Card title="最近错误数" value={fmt(health?.recentErrors)} />
              <Card title="部署版本" value={health?.deployment?.commitSha?.slice(0, 12) ?? "未记录"} meta={`运行环境：${translateLooseLabel(health?.deployment?.nodeEnv ?? "unknown")}`} />
            </div>
          </section>
        ) : null}

        {tab === "AI 运营助手" ? (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex items-center gap-2 rounded-lg bg-[#174d46] px-3 py-2 text-sm font-medium text-[#fffaf0]" onClick={() => void refreshAiReport()} disabled={aiRefreshing}>
                <Sparkles className="h-4 w-4" />
                {aiRefreshing ? "分析中" : "分析问卷与行为数据"}
              </button>
              <button className="rounded-lg border border-[#cfc6b7] bg-[#fffaf0] px-3 py-2 text-sm" onClick={() => void clearAiCache()}>清理分析缓存</button>
            </div>
            <Panel>
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#68746c]">
                <span>分析引擎：{aiReport?.model === "local-rule-fallback" ? "本地规则兜底" : aiReport?.model ? "后台推理模型" : "未生成"}</span>
                <span className="rounded-full border border-[#d8d0c3] bg-[#fffaf0] px-2 py-0.5 text-xs">{aiReport?.degraded ? "已降级" : "可用"}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${aiReport?.output?.evidenceSufficiency === "enough" ? "border-[#b7d4c8] bg-[#effaf5] text-[#0d6b55]" : "border-[#e2c17d] bg-[#fff2cf] text-[#7a4e15]"}`}>
                  证据{aiReport?.output?.evidenceSufficiency === "enough" ? "充分" : "不足"}
                </span>
                <span>整体置信度 {confidenceLabel(aiReport?.output?.confidence?.level)} · 更新时间 {time(aiReport?.output?.generatedAt)}</span>
              </div>
              {aiReport?.output?.confidence?.reason ? <p className="mt-2 text-xs text-[#68746c]">置信说明：{aiReport.output.confidence.reason}</p> : null}
              <p className="mt-3 rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm">{aiReport?.output?.executiveSummary ?? "点击按钮后，基于问卷、反馈、旅程漏斗、留存和 AI 用量生成证据驱动建议。"}</p>
              <div className="mt-3 grid gap-3">
                {(aiReport?.output?.recommendations ?? []).map((r, idx) => (
                  <div key={`${r.title}:${idx}`} className="rounded-lg border border-[#d8d0c3] bg-[#fffdf8] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#174d46] px-2 py-0.5 text-xs font-medium text-[#fffaf0]">{priorityLabel(r.priority)}</span>
                      <span className="rounded-full border border-[#d8d0c3] bg-[#fffaf0] px-2 py-0.5 text-xs">置信度 {confidenceLabel(r.confidence)}</span>
                      <span className="rounded-full border border-[#d8d0c3] bg-[#fffaf0] px-2 py-0.5 text-xs">样本 {r.sampleSize}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-[#123f39]">{r.title}</h3>
                    <p className="mt-2 text-sm text-[#335c54]">{r.claim}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {r.evidenceMetrics.map((e) => <Card key={`${r.title}:${e.metricId}`} title={e.label} value={e.value} meta={`来源：${sourceLabel(e.source)}`} />)}
                    </div>
                    <p className="mt-3 text-sm text-[#68746c]">风险：{r.risk}</p>
                    <p className="mt-1 text-sm text-[#68746c]">建议实验：{r.suggestedExperiment}</p>
                    <p className="mt-1 text-sm text-[#68746c]">预期影响：{r.expectedImpact}</p>
                    <p className="mt-1 text-sm text-[#0d6b55]">下一步：{r.nextAction}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        ) : null}

        {tab === "审计日志" ? (
          <Panel>
            <SectionTitle title="审计日志" />
            <div className="mt-3 grid gap-2">
              {(audit?.rows ?? []).length === 0 ? <p className="text-sm text-[#68746c]">暂无审计记录。</p> : null}
              {(audit?.rows ?? []).map((r) => (
                <div key={r.id} className="grid grid-cols-1 gap-1 rounded-lg border border-[#e1d8ca] bg-[#fffdf8] p-3 text-sm md:grid-cols-[1fr_1fr_0.6fr_1fr]">
                  <span>{auditActionLabel(r.action)}</span>
                  <span>{r.actor ? "管理员" : "系统"}</span>
                  <span className={r.success ? "text-[#0d6b55]" : "text-[#9f2f2f]"}>{r.success ? "成功" : "失败"}</span>
                  <span>{time(r.createdAt)} {r.reason ? `· ${reasonLabel(r.reason)}` : ""}</span>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </section>
    </main>
  );
}
