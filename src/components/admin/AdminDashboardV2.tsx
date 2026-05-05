"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  sampleSize?: number;
  evidenceSufficiency?: string;
  stages?: Array<{ eventName: string; label: string; count: number; stepConversionRate: number; totalConversionRate: number; metricId: string }>;
  updatedAt?: string;
} | null;
type AiExperienceData = {
  sampleSize?: number;
  evidenceSufficiency?: string;
  metrics?: Kpi[];
  rates?: { successRate?: number; failureRate?: number; fallbackRate?: number; parseFailureRate?: number; queueWait?: { status?: string } };
  cost?: { totalTokens?: number; tokenPerEffectiveAction?: number; tokenPerActiveActor?: number; highCostActors?: Array<{ actorKey: string; actions: number; tokens: number }> };
  anomalies?: string[];
  updatedAt?: string;
} | null;
type ContentQualityData = {
  evidenceSufficiency?: string;
  worldSelections?: Array<{ worldId: string; count: number }>;
  validatorIssues?: number;
  feedbackTopics?: Array<{ topic?: string; count?: number }>;
  feedbackSampleSize?: number;
  negativeFeedbackRate?: number;
  surveySampleSize?: number;
  updatedAt?: string;
} | null;
type HealthData = {
  checks?: Record<string, { ok: boolean; degraded: boolean; reason: string | null; updatedAt: string; meta?: Record<string, unknown> }>;
  cron?: { lastRebuildAt?: string | null };
  aggregationFreshness?: string | null;
  recentErrors?: number;
  deployment?: { commitSha?: string | null; nodeEnv?: string };
  updatedAt?: string;
} | null;
type UserRow = { actorKey: string; name: string; actorType: string; tokensUsed: number; playTime: number; lastActive: string | null; isOnline: boolean };
type UsersData = { rows: UserRow[]; nextCursor: string | null; hasMore: boolean; totalApprox: number; limit: number } | null;
type UserDetail = {
  actorKey: string;
  basic?: { name?: string; actorType?: string; tokensUsed?: number; playTime?: number; lastActive?: string | null };
  recentFeedback?: Array<{ kind: string; contentPreview: string; createdAt: string | null }>;
  recentSurvey?: Array<{ surveyKey: string; overallRating: number | null; recommendScore: number | null; createdAt: string | null }>;
  recentSettlements?: Array<{ grade: string; survivalTimeSeconds: number; killedAnomalies: number; maxFloorLabel: string; createdAt: string | null }>;
  recentEvents?: Array<{ eventName: string; eventTime: string | null; page: string | null; source: string | null }>;
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

const TABS = ["总览", "玩家旅程", "AI 等待体验", "内容质量", "玩家 / 游客", "系统健康", "AI 运营助手", "审计日志"] as const;
type Tab = (typeof TABS)[number];
type Range = "today" | "yesterday" | "7d" | "30d";

function percent(v: number | null | undefined): string {
  return `${(Number(v ?? 0) * 100).toFixed(1)}%`;
}

function fmt(v: number | string | null | undefined, unit?: string): string {
  if (v == null) return "unavailable";
  if (typeof v === "number") {
    if (unit === "ratio" || unit === "failure_ratio") return percent(v);
    if (unit === "ms") return `${Math.round(v)} ms`;
    return v.toLocaleString();
  }
  return v;
}

function time(v: string | null | undefined): string {
  if (!v) return "未更新";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "未更新" : d.toLocaleString("zh-CN", { hour12: false });
}

function priorityLabel(v: string): string {
  if (v === "immediate") return "立即";
  if (v === "this_week") return "本周";
  return "中期";
}

function Card({ title, value, meta, degraded }: { title: string; value: string; meta?: string; degraded?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-300">{title}</p>
        {degraded ? <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-100">degraded</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {meta ? <p className="mt-2 text-xs leading-relaxed text-slate-400">{meta}</p> : null}
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  if (kpis.length === 0) {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 text-sm text-slate-300">暂无可用指标，接口可能处于降级状态。</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => (
        <div key={`${k.metricId}:${k.label}:${k.unit ?? ""}`} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-slate-300">{k.label}</p>
            {k.degraded ? <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-100">degraded</span> : null}
          </div>
          <p className="mt-2 text-2xl font-semibold text-white">{fmt(k.value, k.unit)}</p>
          <details className="mt-3 text-xs text-slate-400">
            <summary className="cursor-pointer text-slate-300">口径说明</summary>
            <p className="mt-2 leading-relaxed">{k.definition}</p>
            <p className="mt-1">来源：{k.source}</p>
            <p className="mt-1">更新时间：{time(k.updatedAt)}</p>
            {k.reason ? <p className="mt-1 text-amber-100">原因：{k.reason}</p> : null}
          </details>
        </div>
      ))}
    </div>
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
  const [rebuildDays, setRebuildDays] = useState(3);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadCore = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const nextDegraded: Record<string, string | null> = {};
    try {
      const [ov, j, ai, cq, h, au] = await Promise.all([
        fetchEnvelope<OverviewData>(`/api/admin/overview?range=${range}`),
        fetchEnvelope<JourneyData>(`/api/admin/player-journey?range=${range}&actorType=${journeyActorType}&platform=${journeyPlatform}`),
        fetchEnvelope<AiExperienceData>(`/api/admin/ai-experience?range=${range}`),
        fetchEnvelope<ContentQualityData>(`/api/admin/content-quality?range=${range}`),
        fetchEnvelope<HealthData>("/api/admin/system-health"),
        fetchEnvelope<AuditData>("/api/admin/audit-logs?limit=20"),
      ]);
      for (const [key, item] of Object.entries({ overview: ov, journey: j, ai, content: cq, health: h, audit: au })) {
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
      if (h.env.data) setHealth(h.env.data);
      if (au.env.data) setAudit(au.env.data);
      setDegraded(nextDegraded);
    } finally {
      setRefreshing(false);
    }
  }, [journeyActorType, journeyPlatform, range]);

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
  const degradedList = useMemo(() => Object.entries(degraded).filter(([, reason]) => reason), [degraded]);

  async function refreshAiReport() {
    const { env, status } = await fetchEnvelope<AiReport>(`/api/admin/ai-insights?range=${range}`, { method: "POST" });
    if (status === 403) {
      window.location.href = "/saiduhsa";
      return;
    }
    if (env.data) setAiReport(env.data);
    if (!env.ok || env.degraded) setDegraded((d) => ({ ...d, aiAssistant: env.reason ?? "degraded" }));
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
    <main className="min-h-screen bg-slate-950 p-3 text-slate-100 md:p-6">
      <section className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">运营后台</h1>
              <p className="mt-1 text-sm text-slate-400">
                注册用户 {Number(overviewCards.totalUsers ?? totalUsers).toLocaleString()} · Token {Number(overviewCards.totalTokens ?? totalTokens).toLocaleString()} · 在线 {Number(overviewCards.online ?? onlineCount).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={range} onChange={(e) => setRange(e.target.value as Range)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                <option value="today">今日</option>
                <option value="yesterday">昨日</option>
                <option value="7d">近 7 日</option>
                <option value="30d">近 30 日</option>
              </select>
              <button className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm" onClick={() => void loadCore(true)}>
                {refreshing ? "刷新中" : "刷新"}
              </button>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs">
                <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                自动刷新
              </label>
              <button
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm"
                onClick={async () => {
                  await clearAdminShadowSession();
                  window.location.href = "/saiduhsa";
                }}
              >
                退出
              </button>
            </div>
          </div>
        </header>

        {degradedList.length > 0 ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100" role="status" data-testid="admin-degraded-banner">
            部分数据处于降级状态：{degradedList.map(([k, v]) => `${k}:${v}`).join("；")}
          </div>
        ) : null}

        <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.05] p-2">
          {TABS.map((x) => (
            <button
              key={x}
              className={`shrink-0 rounded-xl px-3 py-2 text-sm ${tab === x ? "bg-emerald-400 text-slate-950" : "bg-white/5 text-slate-200"}`}
              onClick={() => setTab(x)}
            >
              {x}
            </button>
          ))}
        </nav>

        {tab === "总览" ? (
          <section className="space-y-4">
            <KpiGrid kpis={overview?.kpis ?? []} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Card title="DAU / WAU / MAU" value={`${fmt(overviewCards.dau)} / ${fmt(overviewCards.wau)} / ${fmt(overviewCards.mau)}`} meta="来源：admin_metrics_daily，按 UTC 日期聚合。" />
              <Card title="区间游玩时长" value={formatDurationSeconds(Number(overviewCards.playDurationRangeSec ?? 0)) || "暂无"} meta="来源：admin_metrics_daily.total_play_duration_sec。" />
              <Card title="反馈量" value={fmt(overviewCards.feedbackCountRange)} meta="来源：analytics_events.feedback_submitted。" />
            </div>
          </section>
        ) : null}

        {tab === "玩家旅程" ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">玩家旅程漏斗</h2>
                <p className="text-xs text-slate-400">样本 {journey?.sampleSize ?? 0} · {journey?.evidenceSufficiency === "insufficient" ? "数据样本不足" : "样本可用"} · 更新时间 {time(journey?.updatedAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={journeyActorType} onChange={(e) => setJourneyActorType(e.target.value as typeof journeyActorType)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                  <option value="all">全部 actor</option>
                  <option value="registered">注册用户</option>
                  <option value="guest">游客</option>
                </select>
                <select value={journeyPlatform} onChange={(e) => setJourneyPlatform(e.target.value as typeof journeyPlatform)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                  <option value="all">全部端</option>
                  <option value="mobile">Mobile</option>
                  <option value="pc">PC</option>
                </select>
              </div>
            </div>
            <div className="space-y-3">
              {(journey?.stages ?? []).map((s) => (
                <div key={s.eventName} className="rounded-xl bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{s.label}</span>
                    <span>{s.count.toLocaleString()} 人 · 相邻 {percent(s.stepConversionRate)} · 总 {percent(s.totalConversionRate)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-emerald-300" style={{ width: `${Math.max(1, Math.min(100, s.totalConversionRate * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "AI 等待体验" ? (
          <section className="space-y-4">
            <KpiGrid kpis={aiExperience?.metrics ?? []} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Card title="AI 成功率" value={percent(aiExperience?.rates?.successRate)} meta={`样本 ${aiExperience?.sampleSize ?? 0}`} />
              <Card title="失败率" value={percent(aiExperience?.rates?.failureRate)} />
              <Card title="fallback 降级率" value={percent(aiExperience?.rates?.fallbackRate)} />
              <Card title="JSON 修复/解析失败率" value={percent(aiExperience?.rates?.parseFailureRate)} />
              <Card title="总 Token" value={fmt(aiExperience?.cost?.totalTokens)} />
              <Card title="每行动 Token" value={fmt(Math.round(aiExperience?.cost?.tokenPerEffectiveAction ?? 0))} />
              <Card title="每活跃玩家 Token" value={fmt(Math.round(aiExperience?.cost?.tokenPerActiveActor ?? 0))} />
              <Card title="queueWait" value="unavailable" meta="当前未接入独立排队耗时字段。" degraded />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <h3 className="text-sm font-semibold">高成本用户 / 会话</h3>
              <div className="mt-3 grid gap-2">
                {(aiExperience?.cost?.highCostActors ?? []).length === 0 ? <p className="text-sm text-slate-400">暂无样本。</p> : null}
                {(aiExperience?.cost?.highCostActors ?? []).map((x) => (
                  <div key={x.actorKey} className="flex items-center justify-between rounded-xl bg-black/20 p-3 text-sm">
                    <span className="truncate">{x.actorKey}</span>
                    <span>{x.tokens.toLocaleString()} tokens / {x.actions} 次</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "内容质量" ? (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <h2 className="text-lg font-semibold">世界观与章节</h2>
              <p className="text-xs text-slate-400">更新时间 {time(contentQuality?.updatedAt)} · {contentQuality?.evidenceSufficiency === "insufficient" ? "样本不足" : "样本可用"}</p>
              <div className="mt-3 space-y-2">
                {(contentQuality?.worldSelections ?? []).length === 0 ? <p className="text-sm text-slate-400">暂无世界观选择样本。</p> : null}
                {(contentQuality?.worldSelections ?? []).map((w) => <Card key={w.worldId} title={w.worldId} value={w.count.toLocaleString()} />)}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <h2 className="text-lg font-semibold">反馈与规则冲突</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Card title="Validator issue" value={fmt(contentQuality?.validatorIssues)} />
                <Card title="负反馈率" value={percent(contentQuality?.negativeFeedbackRate)} meta={`反馈样本 ${contentQuality?.feedbackSampleSize ?? 0}，问卷样本 ${contentQuality?.surveySampleSize ?? 0}`} />
              </div>
              <div className="mt-3 space-y-2">
                {(contentQuality?.feedbackTopics ?? []).slice(0, 6).map((t) => (
                  <div key={String(t.topic)} className="flex justify-between rounded-xl bg-black/20 p-3 text-sm">
                    <span>{String(t.topic)}</span>
                    <span>{Number(t.count ?? 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "玩家 / 游客" ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4" data-testid="admin-user-table-panel">
            <div className="mb-3 flex flex-wrap gap-2">
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="搜索 actor / 名称" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
              <select value={actorType} onChange={(e) => setActorType(e.target.value as typeof actorType)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                <option value="all">全部</option>
                <option value="registered">注册用户</option>
                <option value="guest">游客</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                <option value="lastActive">最近活跃</option>
                <option value="tokens">Token</option>
                <option value="playTime">游玩时长</option>
              </select>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs">
                <input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} />
                仅在线
              </label>
            </div>
            <div className="grid gap-2">
              {(users?.rows ?? []).length === 0 ? <p className="rounded-xl bg-black/20 p-4 text-sm text-slate-400">暂无用户数据或接口降级。</p> : null}
              {(users?.rows ?? []).map((u) => (
                <div key={u.actorKey} className="grid grid-cols-1 gap-2 rounded-xl bg-black/20 p-3 text-sm md:grid-cols-[1.5fr_0.8fr_1fr_1fr_1fr_0.5fr] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{u.name}</p>
                    <p className="truncate text-xs text-slate-400">{u.actorKey}</p>
                  </div>
                  <span className={u.isOnline ? "text-emerald-200" : "text-slate-400"}>{u.isOnline ? "在线" : "离线"} · {u.actorType}</span>
                  <span>Token {u.tokensUsed.toLocaleString()}</span>
                  <span>{formatDurationSeconds(u.playTime) || "暂无时长"}</span>
                  <span>{time(u.lastActive)}</span>
                  <button className="rounded-lg bg-white/10 px-3 py-1.5 text-xs" onClick={() => void openUserDetail(u.actorKey)}>详情</button>
                </div>
              ))}
            </div>
            {userDetail ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{userDetail.basic?.name ?? userDetail.actorKey}</h3>
                    <p className="text-xs text-slate-400">{userDetail.actorKey} · {userDetail.basic?.actorType ?? "unknown"} · 最近活跃 {time(userDetail.basic?.lastActive)}</p>
                  </div>
                  <button className="rounded-lg bg-white/10 px-3 py-1.5 text-xs" onClick={() => setUserDetail(null)}>关闭</button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Card title="Token" value={fmt(userDetail.basic?.tokensUsed)} />
                  <Card title="游玩时长" value={formatDurationSeconds(Number(userDetail.basic?.playTime ?? 0)) || "暂无"} />
                  <Card title="最近战绩" value={(userDetail.recentSettlements?.[0]?.grade ?? "暂无").toString()} meta={userDetail.recentSettlements?.[0]?.maxFloorLabel ?? ""} />
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-xl bg-white/[0.05] p-3">
                    <h4 className="text-sm font-semibold">最近反馈</h4>
                    {(userDetail.recentFeedback ?? []).length === 0 ? <p className="mt-2 text-xs text-slate-400">暂无</p> : null}
                    {(userDetail.recentFeedback ?? []).map((x, idx) => <p key={`${x.createdAt}:${idx}`} className="mt-2 text-xs text-slate-300">{x.kind} · {x.contentPreview}</p>)}
                  </div>
                  <div className="rounded-xl bg-white/[0.05] p-3">
                    <h4 className="text-sm font-semibold">最近问卷</h4>
                    {(userDetail.recentSurvey ?? []).length === 0 ? <p className="mt-2 text-xs text-slate-400">暂无</p> : null}
                    {(userDetail.recentSurvey ?? []).map((x, idx) => <p key={`${x.createdAt}:${idx}`} className="mt-2 text-xs text-slate-300">{x.surveyKey} · 评分 {x.overallRating ?? "n/a"} · 推荐 {x.recommendScore ?? "n/a"}</p>)}
                  </div>
                  <div className="rounded-xl bg-white/[0.05] p-3">
                    <h4 className="text-sm font-semibold">最近事件</h4>
                    {(userDetail.recentEvents ?? []).length === 0 ? <p className="mt-2 text-xs text-slate-400">暂无</p> : null}
                    {(userDetail.recentEvents ?? []).slice(0, 6).map((x, idx) => <p key={`${x.eventTime}:${idx}`} className="mt-2 text-xs text-slate-300">{x.eventName} · {time(x.eventTime)}</p>)}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
              <span>约 {users?.totalApprox ?? 0} 条 · 每页 {users?.limit ?? 20}</span>
              <div className="flex gap-2">
                <button className="rounded-lg bg-white/10 px-3 py-1.5 disabled:opacity-40" disabled={userCursorStack.length <= 1} onClick={prevUserPage}>上一页</button>
                <button className="rounded-lg bg-white/10 px-3 py-1.5 disabled:opacity-40" disabled={!users?.hasMore} onClick={nextUserPage}>下一页</button>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "系统健康" ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <h2 className="text-lg font-semibold">低风险运营动作</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-sm text-slate-300">重建最近</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={rebuildDays}
                  onChange={(e) => setRebuildDays(Number(e.target.value))}
                  className="w-20 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm"
                />
                <span className="text-sm text-slate-300">天 admin_metrics_daily</span>
                <button className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-medium text-slate-950" onClick={() => void rebuildDailyMetrics()}>
                  手动重建
                </button>
              </div>
              {actionMessage ? <p className="mt-2 text-sm text-emerald-100">{actionMessage}</p> : null}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(health?.checks ?? {}).map(([key, h]) => (
                <Card key={key} title={key} value={h.ok ? "OK" : "降级"} meta={`原因：${h.reason ?? "none"} · 更新时间 ${time(h.updatedAt)}`} degraded={h.degraded} />
              ))}
              <Card title="最近 cron 重建" value={time(health?.cron?.lastRebuildAt)} />
              <Card title="聚合数据新鲜度" value={time(health?.aggregationFreshness)} />
              <Card title="最近错误数" value={fmt(health?.recentErrors)} />
              <Card title="部署版本" value={health?.deployment?.commitSha?.slice(0, 12) ?? "unknown"} meta={`NODE_ENV=${health?.deployment?.nodeEnv ?? "unknown"}`} />
            </div>
          </section>
        ) : null}

        {tab === "AI 运营助手" ? (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-medium text-slate-950" onClick={() => void refreshAiReport()}>手动刷新 AI 洞察</button>
              <button className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm" onClick={() => void clearAiCache()}>清理洞察缓存</button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-sm text-slate-300">模型：{aiReport?.model ?? "未生成"} · {aiReport?.degraded ? "降级" : "可用"} · 更新时间 {time(aiReport?.output?.generatedAt)}</p>
              <p className="mt-3 rounded-xl bg-black/20 p-3 text-sm">{aiReport?.output?.executiveSummary ?? "点击刷新后生成证据驱动建议。"}</p>
              <div className="mt-3 grid gap-3">
                {(aiReport?.output?.recommendations ?? []).map((r, idx) => (
                  <div key={`${r.title}:${idx}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-300 px-2 py-0.5 text-xs font-medium text-slate-950">{priorityLabel(r.priority)}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">置信度 {r.confidence}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">样本 {r.sampleSize}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold">{r.title}</h3>
                    <p className="mt-2 text-sm text-slate-200">{r.claim}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {r.evidenceMetrics.map((e) => <Card key={`${r.title}:${e.metricId}`} title={e.label} value={e.value} meta={`${e.metricId} · ${e.source}`} />)}
                    </div>
                    <p className="mt-3 text-sm text-slate-300">风险：{r.risk}</p>
                    <p className="mt-1 text-sm text-slate-300">实验：{r.suggestedExperiment}</p>
                    <p className="mt-1 text-sm text-slate-300">预期影响：{r.expectedImpact}</p>
                    <p className="mt-1 text-sm text-emerald-100">下一步：{r.nextAction}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "审计日志" ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <h2 className="text-lg font-semibold">审计日志</h2>
            <div className="mt-3 grid gap-2">
              {(audit?.rows ?? []).length === 0 ? <p className="text-sm text-slate-400">暂无审计记录。</p> : null}
              {(audit?.rows ?? []).map((r) => (
                <div key={r.id} className="grid grid-cols-1 gap-1 rounded-xl bg-black/20 p-3 text-sm md:grid-cols-[1fr_1fr_0.6fr_1fr]">
                  <span>{r.action}</span>
                  <span>{r.actor}</span>
                  <span className={r.success ? "text-emerald-200" : "text-rose-200"}>{r.success ? "成功" : "失败"}</span>
                  <span>{time(r.createdAt)} {r.reason ? `· ${r.reason}` : ""}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
