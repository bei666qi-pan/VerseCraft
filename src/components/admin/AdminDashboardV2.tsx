"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { clearAdminShadowSession } from "@/app/actions/admin";
import { formatDurationHoursMinutes } from "@/lib/admin/timeFormat";

type DashboardUserRow = {
  id: string;
  name: string;
  tokensUsed: number;
  playTime: number;
  lastActive: string | Date;
  isOnline: number;
  feedbackContent: string;
  feedbackCreatedAt: string | null;
  latestSurveyKey?: string | null;
  latestSurveyVersion?: string | null;
  latestSurveyAnswers?: Record<string, unknown> | null;
  latestSurveyFreeText?: string | null;
  latestSurveyOverallRating?: number | null;
  latestSurveyRecommendScore?: number | null;
  latestSurveyCreatedAt?: string | null;
  latestGameMaxFloor?: number | null;
  latestGameSurvivalSec?: number | null;
};

type ChartPoint = { date: string; tokens: number; activeUsers?: number; dailyTokens?: number };

type Props = {
  rows: DashboardUserRow[];
  onlineCount: number;
  totalUsers: number;
  totalTokens: number;
  chartData?: ChartPoint[];
};
type OverviewData = {
  cards?: { todayNewUsers?: number; dau?: number; wau?: number; mau?: number; todayTokenCost?: number };
  chartData?: ChartPoint[];
} | null;
type RealtimeData = { onlineUsers?: number; activeSessions?: number; avgSessionDurationSec?: number; trends?: { eventsLast5m?: number; eventsLast15m?: number } } | null;
type RetentionData = { d1?: { rate?: number }; d3?: { rate?: number }; d7?: { rate?: number }; cohortSize?: number } | null;
type FunnelData = { stages?: Array<{ eventName?: string; eventLabel?: string; users?: number; conversionRate?: number }> } | null;
type FeedbackData = { totalFeedback?: number; negativeFeedback?: number; topics?: Array<{ topic?: string; count?: number }> } | null;
type SurveyAggregateData = {
  range?: { label?: string };
  totalResponses?: number;
  questions?: Array<{
    id?: string;
    title?: string;
    kind?: "single" | "text";
    sampleCount?: number;
    options?: Array<{ value?: string; label?: string; count?: number; pct?: number }>;
    textCount?: number;
  }>;
} | null;

const PAGE_SIZE = 12;
const REFRESH_MS = 15000;
type AiReport = {
  model?: string;
  degraded?: boolean;
  input?: {
    range?: { label?: string };
    anomalyHints?: string[];
  };
  output?: {
    executiveSummary?: string;
    retentionRisks?: Array<{ priority: string; title: string; detail: string; evidence: string }>;
    productProblems?: Array<{ priority: string; title: string; detail: string; evidence: string }>;
    opportunityPoints?: Array<{ priority: string; title: string; detail: string; evidence: string }>;
    top3Actions?: Array<{ priority: string; action: string; why: string; expectedImpact: string }>;
    expectedImpact?: { retentionLift?: string; tokenCostChange?: string; confidenceNote?: string };
    confidence?: { score?: number; level?: string; reason?: string };
    evidence?: Array<{ metric: string; value: string; source: string }>;
    suggestedExperiments?: Array<{ name: string; hypothesis: string; metric: string; duration: string }>;
    generatedAt?: string;
    evidenceSufficiency?: string;
  };
};

function toPriorityLabel(v: string): string {
  if (v === "immediate") return "立即修复";
  if (v === "this_week") return "本周可做";
  return "中期优化";
}

function formatPlayTime(totalSeconds: number): string {
  return formatDurationHoursMinutes(Number(totalSeconds) || 0);
}

function formatLastOnline(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN");
}

export default function AdminDashboardV2({ rows: initialRows, onlineCount, totalUsers, totalTokens, chartData: initialChart }: Props) {
  const [range, setRange] = useState<"today" | "yesterday" | "7d" | "30d">("7d");
  const [rows, setRows] = useState(initialRows);
  const [chartData, setChartData] = useState<ChartPoint[]>(initialChart ?? []);
  const [overview, setOverview] = useState<OverviewData>(null);
  const [realtime, setRealtime] = useState<RealtimeData>(null);
  const [retention, setRetention] = useState<RetentionData>(null);
  const [funnel, setFunnel] = useState<FunnelData>(null);
  const [feedbackInsights, setFeedbackInsights] = useState<FeedbackData>(null);
  const [surveyAgg, setSurveyAgg] = useState<SurveyAggregateData>(null);
  const [aiReport, setAiReport] = useState<AiReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRouting, setAiRouting] = useState<unknown>(null);
  const [aiRoutingLoading, setAiRoutingLoading] = useState(false);
  const [realtimeSeries, setRealtimeSeries] = useState<Array<{ t: string; online: number; sessions: number }>>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [detail, setDetail] = useState<{ userName: string; content: string; createdAt: string | null } | null>(null);
  const [surveyDetail, setSurveyDetail] = useState<{
    userName: string;
    createdAt: string | null;
    surveyKey: string | null;
    surveyVersion: string | null;
    answers: Record<string, unknown> | null;
    freeText: string | null;
    overallRating: number | null;
    recommendScore: number | null;
  } | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setErr(null);
    try {
      const [o, r, rt, f, fi, sa, d] = await Promise.all([
        fetch(`/api/admin/overview?range=${range}`, { credentials: "include" }),
        fetch(`/api/admin/retention?range=${range}`, { credentials: "include" }),
        fetch(`/api/admin/realtime`, { credentials: "include" }),
        fetch(`/api/admin/funnel?range=${range}`, { credentials: "include" }),
        fetch(`/api/admin/feedback-insights?range=${range}`, { credentials: "include" }),
        fetch(`/api/admin/survey-aggregate?range=${range}`, { credentials: "include" }),
        fetch(`/api/admin/dashboard-data`, { credentials: "include" }),
      ]);

      const [ov, re, rtj, fu, fb, saj, dj] = await Promise.all([
        o.json().catch(() => null),
        r.json().catch(() => null),
        rt.json().catch(() => null),
        f.json().catch(() => null),
        fi.json().catch(() => null),
        sa.json().catch(() => null),
        d.json().catch(() => null),
      ]);

      const statuses = [o.status, r.status, rt.status, f.status, fi.status, sa.status, d.status];
      if (statuses.some((s) => s === 403)) {
        // Avoid self-redirect loop on /saiduhsa causing full page reload + hydration flicker.
        const pathname = typeof window !== "undefined" ? window.location.pathname : "";
        if (pathname !== "/saiduhsa") {
          window.location.href = "/saiduhsa";
          return;
        }
        setAutoRefresh(false);
        setErr("登录态已失效，请在当前页面重新验证管理员口令。");
        return;
      }

      const hasAnySuccess = [o.ok, r.ok, rt.ok, f.ok, fi.ok, sa.ok, d.ok].some(Boolean);
      if (!hasAnySuccess) throw new Error("后台数据读取失败");

      if (ov) {
        setOverview(ov as OverviewData);
        if (Array.isArray(ov.chartData)) setChartData(ov.chartData);
      }
      if (re) setRetention(re as RetentionData);
      if (rtj) {
        setRealtime(rtj as RealtimeData);
        setRealtimeSeries((prev) => [
          ...prev.slice(-23),
          {
            t: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
            online: Number(rtj.onlineUsers ?? 0),
            sessions: Number(rtj.activeSessions ?? 0),
          },
        ]);
      }
      if (fu) setFunnel(fu as FunnelData);
      if (fb) setFeedbackInsights(fb as FeedbackData);
      if (saj) setSurveyAgg(saj as SurveyAggregateData);
      if (dj?.rows) setRows(dj.rows);
      if (Array.isArray(dj?.chartData) && !ov?.chartData) setChartData(dj.chartData);
    } catch {
      setErr("数据加载失败，请稍后重试。");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [range]);

  const generateAiReport = useCallback(async () => {
    setAiLoading(true);
    try {
      const resp = await fetch(`/api/admin/ai-insights?range=${range}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data) setAiReport(data);
    } finally {
      setAiLoading(false);
    }
  }, [range]);

  const loadAiRouting = useCallback(async () => {
    setAiRoutingLoading(true);
    try {
      const resp = await fetch("/api/admin/ai-routing", { credentials: "include" });
      const data = await resp.json().catch(() => null);
      if (resp.status === 403 && typeof window !== "undefined" && window.location.pathname !== "/saiduhsa") {
        window.location.href = "/saiduhsa";
        return;
      }
      setAiRouting(data);
    } finally {
      setAiRoutingLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll(false);
  }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void fetchAll(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, fetchAll]);

  const cards = useMemo(() => {
    const c = overview?.cards ?? {};
    return {
      online: Number(realtime?.onlineUsers ?? onlineCount ?? 0),
      sessions: Number(realtime?.activeSessions ?? 0),
      todayNew: Number(c.todayNewUsers ?? 0),
      dau: Number(c.dau ?? 0),
      wau: Number(c.wau ?? 0),
      mau: Number(c.mau ?? 0),
      todayToken: Number(c.todayTokenCost ?? 0),
      avgSessionSec: Number(realtime?.avgSessionDurationSec ?? 0),
    };
  }, [overview, realtime, onlineCount]);

  const alerts = useMemo(() => {
    const list: string[] = [];
    if ((retention?.d1?.rate ?? 1) < 0.2) list.push("D1 留存偏低，请排查新手引导。");
    const tokenPerDau = cards.dau > 0 ? cards.todayToken / cards.dau : 0;
    if (tokenPerDau > 5000) list.push("人均 Token 偏高，关注模型成本。");
    if ((realtime?.trends?.eventsLast5m ?? 0) > (realtime?.trends?.eventsLast15m ?? 0)) list.push("近5分钟事件波动偏高。");
    return list;
  }, [cards, realtime, retention]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyOnline && r.isOnline !== 1) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || String(r.feedbackContent ?? "").toLowerCase().includes(q);
    });
  }, [rows, search, onlyOnline]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="h-8 w-52 animate-pulse rounded-xl bg-white/10" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/10" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
      <section className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">运营决策台</h1>
            <p className="text-sm text-slate-400">总用户 {Number(totalUsers).toLocaleString()} · 累计 Token {Number(totalTokens).toLocaleString()}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={range} onChange={(e) => setRange(e.target.value as "today" | "yesterday" | "7d" | "30d")} className="rounded-xl bg-white/10 px-3 py-2 text-sm backdrop-blur-xl">
              <option value="today">今日</option>
              <option value="yesterday">昨日</option>
              <option value="7d">近7天</option>
              <option value="30d">近30天</option>
            </select>
            <button className="rounded-xl bg-white/10 px-3 py-2 text-sm backdrop-blur-xl" onClick={() => void fetchAll(true)}>
              {refreshing ? "刷新中..." : "手动刷新"}
            </button>
            <label className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs backdrop-blur-xl">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              自动刷新
            </label>
          </div>
        </div>

        {err ? (
          <div className="rounded-2xl bg-red-500/15 p-3 text-sm text-red-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{err}</span>
              {err.includes("登录态已失效") ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await clearAdminShadowSession();
                    } finally {
                      window.location.href = `/saiduhsa?reauth=${Date.now()}`;
                    }
                  }}
                  className="rounded-lg bg-white/15 px-3 py-1.5 text-xs text-white transition hover:bg-white/25"
                >
                  重新验证
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {[
            ["在线人数", cards.online],
            ["活跃会话", cards.sessions],
            ["今日新增", cards.todayNew],
            ["DAU", cards.dau],
            ["WAU", cards.wau],
            ["MAU", cards.mau],
            ["今日Token", cards.todayToken],
            ["平均会话时长", formatDurationHoursMinutes(cards.avgSessionSec)],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-2xl bg-white/10 p-3 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
              <p className="text-xs text-slate-300">{k}</p>
              <p className="mt-2 text-lg font-semibold">{typeof v === "number" ? v.toLocaleString() : String(v)}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] xl:col-span-2">
            <p className="mb-3 text-sm">近24小时实时活跃趋势</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={realtimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#cbd5e1" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#cbd5e1" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="online" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sessions" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
            <p className="mb-3 text-sm">异常提示</p>
            <div className="space-y-2 text-sm">
              {alerts.length === 0 ? <p className="text-slate-300">暂无显著异常。</p> : alerts.map((a, i) => <div key={i} className="rounded-xl bg-yellow-500/15 p-2 text-yellow-100">{a}</div>)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
            <p className="mb-3 text-sm">新增与活跃趋势</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#cbd5e1" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#cbd5e1" }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="activeUsers" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
            <p className="mb-3 text-sm">Token 消耗趋势</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#cbd5e1" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#cbd5e1" }} />
                  <Tooltip formatter={(v) => [Number(v ?? 0).toLocaleString(), "Token"]} />
                  <Bar dataKey="dailyTokens" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
            <p className="mb-2 text-sm">留存</p>
            <p className="text-sm">D1：{((Number(retention?.d1?.rate ?? 0)) * 100).toFixed(1)}%</p>
            <p className="text-sm">D3：{((Number(retention?.d3?.rate ?? 0)) * 100).toFixed(1)}%</p>
            <p className="text-sm">D7：{((Number(retention?.d7?.rate ?? 0)) * 100).toFixed(1)}%</p>
            <p className="mt-1 text-xs text-slate-300">样本：{Number(retention?.cohortSize ?? 0)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] xl:col-span-2">
            <p className="mb-2 text-sm">漏斗</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(funnel?.stages ?? []).map((s) => (
                <div key={String(s.eventName)} className="rounded-xl bg-white/10 p-2">
                  <p className="text-xs text-slate-300">{String(s.eventLabel ?? s.eventName ?? "")}</p>
                  <p className="text-lg font-semibold">{Number(s.users ?? 0)}</p>
                  <p className="text-xs text-slate-400">{(Number(s.conversionRate ?? 0) * 100).toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm">问卷聚合（{range}）</p>
              <p className="mt-1 text-xs text-slate-300">
                样本 {Number(surveyAgg?.totalResponses ?? 0)} · 口径 {String(surveyAgg?.range?.label ?? "")}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(surveyAgg?.questions ?? []).map((q) => {
              const title = String(q.title ?? q.id ?? "unknown");
              if (q.kind === "text") {
                return (
                  <div key={String(q.id)} className="rounded-2xl bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="text-xs text-slate-300">文本条数 {Number(q.textCount ?? 0)}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">文本题不做选项聚合；建议在“按用户查看问卷”里抽样阅读。</p>
                  </div>
                );
              }
              const opts = Array.isArray(q.options) ? q.options : [];
              const top = opts.slice(0, 5);
              const rest = opts.slice(5);
              const restCount = rest.reduce((s, x) => s + Number(x.count ?? 0), 0);
              const restPct = rest.reduce((s, x) => s + Number(x.pct ?? 0), 0);
              const rowsToShow =
                rest.length > 0
                  ? [...top, { label: "其他", count: restCount, pct: Math.round(restPct * 10) / 10 }]
                  : top;
              const sample = Number(q.sampleCount ?? 0);
              return (
                <div key={String(q.id)} className="rounded-2xl bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-slate-300">有效样本 {sample}</p>
                  </div>
                  {sample <= 0 ? (
                    <p className="mt-3 text-xs text-slate-400">样本不足</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {rowsToShow.map((o, idx) => {
                        const label = String((o as { label?: string }).label ?? "");
                        const count = Number((o as { count?: number }).count ?? 0);
                        const pct = Number((o as { pct?: number }).pct ?? 0);
                        return (
                          <div key={`${String(q.id)}:${idx}`} className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-slate-200">
                              <span className="truncate pr-2">{label}</span>
                              <span className="shrink-0 text-slate-300">
                                {count}（{pct.toFixed(1)}%）
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] xl:col-span-2">
            <p className="mb-2 text-sm">反馈与问题洞察</p>
            <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-200">
              <span className="rounded-lg bg-white/10 px-2 py-1">反馈 {Number(feedbackInsights?.totalFeedback ?? 0)}</span>
              <span className="rounded-lg bg-white/10 px-2 py-1">负向 {Number(feedbackInsights?.negativeFeedback ?? 0)}</span>
              {(feedbackInsights?.topics ?? []).slice(0, 3).map((t) => (
                <span key={String(t.topic)} className="rounded-lg bg-white/10 px-2 py-1">{String(t.topic)} {Number(t.count ?? 0)}</span>
              ))}
            </div>
            <div className="space-y-2">
              {rows.filter((r) => r.feedbackContent).slice(0, 4).map((r) => (
                <button key={r.id} className="w-full rounded-xl bg-white/10 p-2 text-left text-xs hover:bg-white/15" onClick={() => setDetail({ userName: r.name, content: r.feedbackContent, createdAt: r.feedbackCreatedAt })}>
                  <span className="mr-1 text-slate-400">[{r.name}]</span>{r.feedbackContent.slice(0, 80)}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm">AI 运营分析官</p>
              <button className="rounded-lg bg-white/10 px-2 py-1 text-xs" onClick={() => void generateAiReport()} disabled={aiLoading}>
                {aiLoading ? "生成中..." : "一键生成分析"}
              </button>
            </div>
            <div className="space-y-2 text-sm">
              {aiReport?.output?.generatedAt ? (
                <p className="text-xs text-slate-300">生成时间：{new Date(aiReport.output.generatedAt).toLocaleString("zh-CN")}</p>
              ) : null}
              <p className="rounded-xl bg-white/10 p-2 text-xs text-slate-200">
                {aiReport?.output?.executiveSummary ?? "点击“一键生成分析”获取可追溯的结构化建议。"}
              </p>
              {aiReport?.output?.evidenceSufficiency === "insufficient" ? (
                <p className="rounded-xl bg-yellow-500/15 p-2 text-xs text-yellow-100">证据不足：样本量偏小，建议先扩大采样窗口再决策。</p>
              ) : null}
              {(aiReport?.output?.top3Actions ?? []).map((a, i) => (
                <div key={i} className="rounded-xl bg-white/10 p-2 text-xs">
                  <p className="text-slate-300">{toPriorityLabel(String(a.priority))}</p>
                  <p className="mt-1 text-slate-100">{a.action}</p>
                  <p className="mt-1 text-slate-300">{a.why}</p>
                </div>
              ))}
              <div className="rounded-xl bg-white/10 p-2 text-xs">
                <p className="text-slate-300">证据来源摘要</p>
                {(aiReport?.output?.evidence ?? []).slice(0, 3).map((e, i) => (
                  <p key={i} className="mt-1 text-slate-200">{e.metric}: {e.value}（{e.source}）</p>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">大模型路由与熔断</p>
            <button className="rounded-lg bg-white/10 px-2 py-1 text-xs" type="button" onClick={() => void loadAiRouting()} disabled={aiRoutingLoading}>
              {aiRoutingLoading ? "加载中..." : "刷新"}
            </button>
          </div>
          <p className="mb-2 text-xs text-slate-300">近期路由样本与按模型熔断快照（进程内存，重启清空）。</p>
          <pre className="max-h-64 overflow-auto rounded-xl bg-black/20 p-3 text-[11px] leading-relaxed text-slate-200 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
            {aiRouting === null ? "点击「刷新」拉取。" : JSON.stringify(aiRouting, null, 2)}
          </pre>
        </div>

        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索账号/反馈" className="rounded-xl bg-white/10 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs">
              <input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} />
              仅在线
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-slate-300">
                <tr>
                  <th className="px-3 py-2">账号</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">累计 Token</th>
                  <th className="px-3 py-2">累计时长</th>
                  <th className="px-3 py-2">最近活跃</th>
                  <th className="px-3 py-2">最近问卷</th>
                  <th className="px-3 py-2">最近反馈</th>
                  <th className="px-3 py-2">最近一局</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((u) => (
                  <tr key={u.id} className="border-t border-white/10">
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2">{u.isOnline === 1 ? "在线" : "离线"}</td>
                    <td className="px-3 py-2">{Number(u.tokensUsed ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2">{formatPlayTime(Number(u.playTime ?? 0))}</td>
                    <td className="px-3 py-2">{formatLastOnline(u.lastActive)}</td>
                    <td className="px-3 py-2">
                      {u.latestSurveyAnswers ? (
                        <button
                          className="rounded-lg bg-white/10 px-2 py-1 text-xs"
                          onClick={() =>
                            setSurveyDetail({
                              userName: u.name,
                              createdAt: u.latestSurveyCreatedAt ?? null,
                              surveyKey: u.latestSurveyKey ?? null,
                              surveyVersion: u.latestSurveyVersion ?? null,
                              answers: u.latestSurveyAnswers ?? null,
                              freeText: u.latestSurveyFreeText ?? null,
                              overallRating:
                                typeof u.latestSurveyOverallRating === "number" ? u.latestSurveyOverallRating : null,
                              recommendScore:
                                typeof u.latestSurveyRecommendScore === "number" ? u.latestSurveyRecommendScore : null,
                            })
                          }
                        >
                          查看
                        </button>
                      ) : (
                        "暂无"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {u.feedbackContent ? <button className="rounded-lg bg-white/10 px-2 py-1 text-xs" onClick={() => setDetail({ userName: u.name, content: u.feedbackContent, createdAt: u.feedbackCreatedAt })}>查看</button> : "暂无"}
                    </td>
                    <td className="px-3 py-2">{u.latestGameMaxFloor != null ? `层 ${u.latestGameMaxFloor} / ${Math.floor(Number(u.latestGameSurvivalSec ?? 0) / 60)}分` : "暂无"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
            <span>第 {page}/{totalPages} 页，共 {filtered.length} 条</span>
            <div className="flex gap-2">
              <button className="rounded-lg bg-white/10 px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
              <button className="rounded-lg bg-white/10 px-2 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>下一页</button>
            </div>
          </div>
        </div>
      </section>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm">反馈详情 · {detail.userName}</p>
              <button className="rounded-lg bg-white/10 px-2 py-1 text-xs" onClick={() => setDetail(null)}>关闭</button>
            </div>
            <p className="mt-2 text-sm text-slate-200">{detail.content}</p>
          </div>
        </div>
      ) : null}

      {surveyDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm">问卷详情 · {surveyDetail.userName}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {surveyDetail.createdAt ? `提交时间：${new Date(surveyDetail.createdAt).toLocaleString("zh-CN")}` : "提交时间：未知"}
                  {surveyDetail.surveyKey ? ` · key=${surveyDetail.surveyKey}` : ""}
                  {surveyDetail.surveyVersion ? ` · v=${surveyDetail.surveyVersion}` : ""}
                </p>
              </div>
              <button className="rounded-lg bg-white/10 px-2 py-1 text-xs" onClick={() => setSurveyDetail(null)}>
                关闭
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-200">
                <div className="text-slate-400">overallRating</div>
                <div className="mt-1 text-sm font-semibold">{surveyDetail.overallRating ?? "null"}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-200">
                <div className="text-slate-400">recommendScore</div>
                <div className="mt-1 text-sm font-semibold">{surveyDetail.recommendScore ?? "null"}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-200">
                <div className="text-slate-400">freeText</div>
                <div className="mt-1 text-sm font-semibold">{surveyDetail.freeText ? "有" : "无"}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-black/20 p-3">
                <p className="mb-2 text-xs text-slate-300">answers</p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-100">
                  {surveyDetail.answers ? JSON.stringify(surveyDetail.answers, null, 2) : "null"}
                </pre>
              </div>
              <div className="rounded-xl bg-black/20 p-3">
                <p className="mb-2 text-xs text-slate-300">freeText</p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-100">
                  {surveyDetail.freeText ?? ""}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

