"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { clearAdminShadowSession } from "@/app/actions/admin";
import { formatZhCnUtcDateTime, formatZhCnUtcTimeShort, formatUtcDateKeyLabel } from "@/lib/admin/formatDisplay";
import type { AdminApiEnvelope } from "@/lib/admin/apiEnvelope";
import { readAdminResponseJson } from "@/lib/admin/parseAdminEnvelope";
import { formatDurationSeconds, formatPlayTimeFromDbSeconds } from "@/lib/time/durationUnits";
import { AdminErrorBoundary } from "@/components/admin/AdminErrorBoundary";
import { AdminBlockSkeleton, AdminKpiRowSkeleton } from "@/components/admin/AdminPanelSkeleton";

type DashboardUserRow = {
  id: string;
  name: string;
  tokensUsed: number;
  playTime: number;
  /** Sum of `user_sessions.total_play_duration_sec` / `guest_sessions` for this account (wall-clock presence). */
  sessionPlaySec?: number;
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
  cards?: {
    todayNewUsers?: number;
    dau?: number;
    wau?: number;
    mau?: number;
    todayTokenCost?: number;
    playDurationRangeSec?: number;
    legacyUsersPlayTimeSecSum?: number;
    sessionPlayLiveSecSum?: number;
    guestsTotal?: number;
    guestsOnline?: number;
    guestsPlayDurationSec?: number;
  };
  chartData?: ChartPoint[];
} | null;
type RealtimeData = {
  onlineUsers?: number;
  onlineGuests?: number;
  activeSessions?: number;
  avgSessionDurationSec?: number;
  trends?: { eventsLast5m?: number; eventsLast15m?: number };
  presenceDebug?: {
    redis: number;
    db: number;
    both: number;
    dbOnly: number;
    redisOnly: number;
    redisDown: boolean;
  };
} | null;
type RetentionKindBlock = { cohortSize?: number; d1?: { rate?: number }; d3?: { rate?: number }; d7?: { rate?: number } };
type RetentionData = {
  d1?: { rate?: number };
  d3?: { rate?: number };
  d7?: { rate?: number };
  cohortSize?: number;
  byActorKind?: { registered?: RetentionKindBlock; guest?: RetentionKindBlock; all?: RetentionKindBlock };
} | null;
type FunnelData = {
  stages?: Array<{
    eventName?: string;
    eventLabel?: string;
    users?: number;
    registered?: number;
    guest?: number;
    all?: number;
    conversionRate?: number;
    conversionRateRegistered?: number;
    conversionRateGuest?: number;
  }>;
} | null;
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

type DegradedKey =
  | "overview"
  | "retention"
  | "realtime"
  | "funnel"
  | "feedback"
  | "survey"
  | "dashboard";

const DEGRADED_LABEL: Record<DegradedKey, string> = {
  overview: "概览指标",
  retention: "留存",
  realtime: "实时在线",
  funnel: "漏斗",
  feedback: "反馈洞察",
  survey: "问卷聚合",
  dashboard: "用户表 / 底表",
};

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

function formatLastOnline(value: string | Date): string {
  return formatZhCnUtcDateTime(value);
}

function formatCountOrEmpty(n: number, emptyText: string): string {
  return n === 0 ? emptyText : n.toLocaleString();
}

function PanelFrame({
  label,
  showSlow,
  slow,
  children,
}: {
  label: string;
  showSlow: boolean;
  slow: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminErrorBoundary label={label}>
      <Suspense fallback={slow}>{showSlow ? slow : children}</Suspense>
    </AdminErrorBoundary>
  );
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
  const [showSlowSkeleton, setShowSlowSkeleton] = useState(false);
  const [degraded, setDegraded] = useState<Partial<Record<DegradedKey, { reason: string | null }>>>({});
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
    if (!silent) {
      /* first paint uses SSR props; no full-page block */
    }
    setRefreshing(true);
    setErr(null);
    setDegraded({});
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

      const statuses = [o.status, r.status, rt.status, f.status, fi.status, sa.status, d.status];
      if (statuses.some((s) => s === 403)) {
        const pathname = typeof window !== "undefined" ? window.location.pathname : "";
        if (pathname !== "/saiduhsa") {
          window.location.href = "/saiduhsa";
          return;
        }
        setAutoRefresh(false);
        setErr("登录态已失效，请在当前页面重新验证管理员口令。");
        return;
      }

      const [ovE, reE, rtE, fuE, fbE, saE, djE] = await Promise.all([
        readAdminResponseJson<OverviewData>(o),
        readAdminResponseJson<RetentionData>(r),
        readAdminResponseJson<RealtimeData>(rt),
        readAdminResponseJson<FunnelData>(f),
        readAdminResponseJson<FeedbackData>(fi),
        readAdminResponseJson<SurveyAggregateData>(sa),
        readAdminResponseJson<{ rows?: DashboardUserRow[]; chartData?: ChartPoint[] }>(d),
      ]);

      const nextDegraded: Partial<Record<DegradedKey, { reason: string | null }>> = {};

      const take = <T,>(key: DegradedKey, res: Response, env: AdminApiEnvelope<T>, apply: (data: T) => void) => {
        const httpOk = res.ok;
        const data = env.data;
        if (httpOk && env.ok && data != null) {
          apply(data);
          if (env.degraded) nextDegraded[key] = { reason: env.reason };
          return;
        }
        const reason = !httpOk ? `http_${res.status}` : env.reason ?? "unavailable";
        nextDegraded[key] = { reason };
      };

      take("overview", o, ovE, (data) => {
        setOverview(data);
        if (Array.isArray(data?.chartData)) setChartData(data.chartData);
      });
      take("retention", r, reE, (data) => setRetention(data));
      take("realtime", rt, rtE, (data) => {
        setRealtime(data);
        setRealtimeSeries((prev) => [
          ...prev.slice(-23),
          {
            t: formatZhCnUtcTimeShort(),
            online: Number(data.onlineUsers ?? 0) + Number(data.onlineGuests ?? 0),
            sessions: Number(data.activeSessions ?? 0),
          },
        ]);
      });
      take("funnel", f, fuE, (data) => setFunnel(data));
      take("feedback", fi, fbE, (data) => setFeedbackInsights(data));
      take("survey", sa, saE, (data) => setSurveyAgg(data));
      take("dashboard", d, djE, (dj) => {
        if (dj?.rows) setRows(dj.rows);
        const hadOverviewChart = Array.isArray(ovE.data && (ovE.data as OverviewData)?.chartData);
        if (Array.isArray(dj?.chartData) && !hadOverviewChart) setChartData(dj.chartData);
      });

      setDegraded(nextDegraded);
    } catch {
      setErr("数据加载遇到异常，部分区域可能仍为缓存或初始数据。");
    } finally {
      setRefreshing(false);
    }
  }, [range]);

  const generateAiReport = useCallback(async () => {
    setAiLoading(true);
    try {
      const resp = await fetch(`/api/admin/ai-insights?range=${range}`, {
        method: "POST",
        credentials: "include",
      });
      const env = await readAdminResponseJson<AiReport>(resp);
      if (resp.ok && env.ok && env.data) setAiReport(env.data);
    } finally {
      setAiLoading(false);
    }
  }, [range]);

  const loadAiRouting = useCallback(async () => {
    setAiRoutingLoading(true);
    try {
      const resp = await fetch("/api/admin/ai-routing", { credentials: "include" });
      if (resp.status === 403 && typeof window !== "undefined" && window.location.pathname !== "/saiduhsa") {
        window.location.href = "/saiduhsa";
        return;
      }
      const env = await readAdminResponseJson<unknown>(resp);
      if (resp.ok && env.ok) setAiRouting(env.data ?? null);
      else setAiRouting({ degraded: true, reason: env.reason ?? "ai_routing_unavailable" });
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

  useEffect(() => {
    if (!refreshing) {
      setShowSlowSkeleton(false);
      return;
    }
    const id = window.setTimeout(() => setShowSlowSkeleton(true), 2000);
    return () => clearTimeout(id);
  }, [refreshing]);

  const cards = useMemo(() => {
    const c = overview?.cards ?? {};
    return {
      online: Number(realtime?.onlineUsers ?? onlineCount ?? 0),
      onlineGuests: Number(realtime?.onlineGuests ?? 0),
      sessions: Number(realtime?.activeSessions ?? 0),
      todayNew: Number(c.todayNewUsers ?? 0),
      dau: Number(c.dau ?? 0),
      wau: Number(c.wau ?? 0),
      mau: Number(c.mau ?? 0),
      todayToken: Number(c.todayTokenCost ?? 0),
      avgSessionSec: Number(realtime?.avgSessionDurationSec ?? 0),
      playInRangeSec: Number(c.playDurationRangeSec ?? 0),
      legacyPlaySumSec: Number(c.legacyUsersPlayTimeSecSum ?? 0),
      sessionPlayLiveSec: Number(c.sessionPlayLiveSecSum ?? 0),
      guestsTotal: Number(c.guestsTotal ?? 0),
      guestsOnline: Number(c.guestsOnline ?? 0),
      guestsPlaySec: Number(c.guestsPlayDurationSec ?? 0),
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

  const degradedList = useMemo(() => {
    return (Object.entries(degraded) as Array<[DegradedKey, { reason: string | null }]>)
      .map(([k, v]) => ({ key: k, label: DEGRADED_LABEL[k], reason: v.reason }))
      .filter((x) => x.label);
  }, [degraded]);

  const showKpiSlow = showSlowSkeleton && refreshing;

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

        {degradedList.length > 0 ? (
          <div
            className="rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-50/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
            data-testid="admin-degraded-banner"
            role="status"
          >
            <p className="font-medium">部分数据暂以降级方式展示</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-100/90">
              {degradedList.map((x) => (
                <li key={x.key}>
                  {x.label}
                  {x.reason ? <span className="text-amber-200/80">（{x.reason}）</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <PanelFrame
          label="核心指标"
          showSlow={showKpiSlow}
          slow={<AdminKpiRowSkeleton />}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-9">
            {(
              [
                ["在线用户", formatCountOrEmpty(cards.online, "暂无在线用户")],
                ["在线游客(会话)", formatCountOrEmpty(cards.onlineGuests, "暂无游客在线")],
                ["活跃会话行", formatCountOrEmpty(cards.sessions, "暂无活跃会话")],
                ["今日新增", formatCountOrEmpty(cards.todayNew, "今日暂无新增")],
                ["DAU", formatCountOrEmpty(cards.dau, "本区间暂无")],
                ["WAU", formatCountOrEmpty(cards.wau, "本区间暂无")],
                ["MAU", formatCountOrEmpty(cards.mau, "本区间暂无")],
                [
                  "今日Token",
                  cards.todayToken === 0 ? "本日暂无消耗" : cards.todayToken.toLocaleString(),
                ],
                ["平均会话时长", formatDurationSeconds(Number(cards.avgSessionSec) || 0) || "暂无数据"],
              ] as const
            ).map(([k, v]) => (
              <div
                key={String(k)}
                className="rounded-2xl bg-white/10 p-3 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
              >
                <p className="text-xs text-slate-300">{k}</p>
                <p className="mt-2 text-lg font-semibold">{v}</p>
              </div>
            ))}
          </div>
        </PanelFrame>

        {process.env.NODE_ENV === "development" && realtime?.presenceDebug ? (
          <div className="rounded-2xl bg-white/5 p-3 text-xs text-slate-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
            <p className="mb-1 font-medium text-slate-200">在线判定（开发）</p>
            <p>
              redis={realtime.presenceDebug.redis} · db={realtime.presenceDebug.db} · 重叠={realtime.presenceDebug.both} ·
              仅redis={realtime.presenceDebug.redisOnly} · 仅db={realtime.presenceDebug.dbOnly} · redisDown=
              {realtime.presenceDebug.redisDown ? "1" : "0"}
            </p>
            <p className="mt-1 text-slate-500">人工解读：两路任一为真即算在线；仅db 且 Redis 正常时会记 presence_flaky</p>
          </div>
        ) : null}

        <PanelFrame
          label="游客与会话"
          showSlow={showKpiSlow}
          slow={
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-2xl bg-gradient-to-br from-white/[0.1] to-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
                  data-testid="admin-block-skeleton"
                />
              ))}
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["游客档案数（guest_registry）", cards.guestsTotal === 0 ? "暂无游客档案" : cards.guestsTotal.toLocaleString()],
              [
                "游客在线（近90s, guest_registry）",
                formatCountOrEmpty(cards.guestsOnline, "暂无游客在线"),
              ],
              [
                "游客累计游玩秒（guest_registry）",
                cards.guestsPlaySec === 0 ? "暂无游玩记录" : formatDurationSeconds(cards.guestsPlaySec),
              ],
            ].map(([k, v]) => (
              <div
                key={String(k)}
                className="rounded-2xl bg-white/5 p-3 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
              >
                <p className="text-xs text-slate-400">{k}</p>
                <p className="mt-2 text-sm font-medium text-slate-100">{v}</p>
              </div>
            ))}
          </div>
        </PanelFrame>

        <PanelFrame
          label="时长与驻留"
          showSlow={showKpiSlow}
          slow={
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-2xl bg-gradient-to-br from-white/[0.1] to-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
                />
              ))}
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              [
                "选中区间内驻留（日滚, UTC）",
                cards.playInRangeSec === 0 ? "暂无数据" : formatDurationSeconds(cards.playInRangeSec),
              ],
              [
                "全量会话驻留（user_sessions 汇总）",
                cards.sessionPlayLiveSec === 0 ? "暂无数据" : formatDurationSeconds(cards.sessionPlayLiveSec),
              ],
              [
                "历史累计（users.play_time 旧口径）",
                cards.legacyPlaySumSec === 0 ? "暂无数据" : formatDurationSeconds(cards.legacyPlaySumSec),
              ],
            ].map(([k, v]) => (
              <div
                key={String(k)}
                className="rounded-2xl bg-white/5 p-3 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
              >
                <p className="text-xs text-slate-400">{k}</p>
                <p className="mt-2 text-sm font-medium text-slate-100">{v}</p>
              </div>
            ))}
          </div>
        </PanelFrame>

        <PanelFrame
          label="实时趋势与异常"
          showSlow={showSlowSkeleton && refreshing}
          slow={
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2" data-testid="admin-charts-slow-slot">
                <AdminBlockSkeleton h="h-56" />
              </div>
              <AdminBlockSkeleton h="h-56" />
            </div>
          }
        >
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
        </PanelFrame>

        <PanelFrame
          label="新增、活跃与 Token"
          showSlow={showSlowSkeleton && refreshing}
          slow={
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <AdminBlockSkeleton h="h-56" />
              <AdminBlockSkeleton h="h-56" />
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2" data-testid="admin-trend-charts">
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
              <p className="mb-3 text-sm">新增与活跃趋势</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#cbd5e1" }}
                      tickFormatter={(v) => formatUtcDateKeyLabel(String(v))}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#cbd5e1" }} />
                    <Tooltip labelFormatter={(v) => `UTC ${formatUtcDateKeyLabel(String(v))}`} />
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
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#cbd5e1" }}
                      tickFormatter={(v) => formatUtcDateKeyLabel(String(v))}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#cbd5e1" }} />
                    <Tooltip
                      labelFormatter={(v) => `UTC ${formatUtcDateKeyLabel(String(v))}`}
                      formatter={(v) => [Number(v ?? 0).toLocaleString(), "Token"]}
                    />
                    <Bar dataKey="dailyTokens" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </PanelFrame>

        <PanelFrame
          label="留存与漏斗"
          showSlow={showSlowSkeleton && refreshing}
          slow={
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <AdminBlockSkeleton h="min-h-[12rem]" />
              <div className="xl:col-span-2">
                <AdminBlockSkeleton h="min-h-[12rem]" />
              </div>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-3 rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
            <p className="text-sm">留存</p>
            {(["all", "registered", "guest"] as const).map((k) => {
              const legacyAll =
                retention && !retention.byActorKind
                  ? {
                      cohortSize: retention.cohortSize,
                      d1: retention.d1,
                      d3: retention.d3,
                      d7: retention.d7,
                    }
                  : undefined;
              const b =
                k === "all"
                  ? retention?.byActorKind?.all ?? legacyAll
                  : k === "registered"
                    ? retention?.byActorKind?.registered
                    : retention?.byActorKind?.guest;
              const label = k === "all" ? "合计" : k === "registered" ? "登录" : "游客";
              return (
                <div key={k} className="rounded-xl bg-white/5 p-2 text-xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
                  <p className="text-slate-300">{label}</p>
                  <p className="text-sm text-slate-100">D1 {((Number(b?.d1?.rate ?? 0)) * 100).toFixed(1)}% · D3 {((Number(b?.d3?.rate ?? 0)) * 100).toFixed(1)}% · D7 {((Number(b?.d7?.rate ?? 0)) * 100).toFixed(1)}%</p>
                  <p className="text-slate-500">样本 {Number(b?.cohortSize ?? 0)}</p>
                </div>
              );
            })}
            <p className="text-xs text-slate-500">合计列为历史混合口径；登录/游客为拆分口径。</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] xl:col-span-2">
            <p className="mb-2 text-sm">漏斗（登录 / 游客 / 合计 · 人）</p>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {(funnel?.stages ?? []).length === 0 ? (
                <p className="text-xs text-slate-400">暂无漏斗数据</p>
              ) : null}
              {(funnel?.stages ?? []).map((s) => (
                <div
                  key={String(s.eventName)}
                  className="grid grid-cols-1 gap-1 rounded-xl bg-white/5 p-2 text-xs sm:grid-cols-4"
                >
                  <div className="text-slate-200 sm:col-span-1">{String(s.eventLabel ?? s.eventName ?? "")}</div>
                  <div className="text-slate-300">
                    登录 {Number(s.registered ?? 0)}（{((Number(s.conversionRateRegistered ?? 0)) * 100).toFixed(1)}%）
                  </div>
                  <div className="text-slate-300">
                    游客 {Number(s.guest ?? 0)}（{((Number(s.conversionRateGuest ?? 0)) * 100).toFixed(1)}%）
                  </div>
                  <div className="text-slate-200">
                    合计 {Number(s.all ?? s.users ?? 0)}（{((Number(s.conversionRate ?? 0)) * 100).toFixed(1)}%）
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        </PanelFrame>

        <PanelFrame
          label="问卷聚合"
          showSlow={showSlowSkeleton && refreshing}
          slow={<AdminBlockSkeleton h="min-h-[14rem]" />}
        >
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
        </PanelFrame>

        <PanelFrame
          label="反馈与 AI 分析"
          showSlow={showSlowSkeleton && refreshing}
          slow={
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <AdminBlockSkeleton h="min-h-[12rem]" />
              </div>
              <AdminBlockSkeleton h="min-h-[12rem]" />
            </div>
          }
        >
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
                <p className="text-xs text-slate-300">生成时间（UTC）：{formatZhCnUtcDateTime(aiReport.output.generatedAt)}</p>
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
        </PanelFrame>

        <AdminErrorBoundary label="大模型路由">
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
        </AdminErrorBoundary>

        <PanelFrame
          label="用户与问卷明细表"
          showSlow={showSlowSkeleton && refreshing}
          slow={
            <div className="space-y-3">
              <div className="h-10 w-full max-w-md animate-pulse rounded-xl bg-white/10" />
              <AdminBlockSkeleton h="min-h-[16rem]" />
            </div>
          }
        >
        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]" data-testid="admin-user-table-panel">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索账号/反馈" className="rounded-xl bg-white/10 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs">
              <input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} />
              仅在线
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="text-slate-300">
                <tr>
                  <th className="px-3 py-2">账号</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">累计 Token</th>
                  <th className="px-3 py-2">历史累计（旧口径）</th>
                  <th className="px-3 py-2">会话驻留</th>
                  <th className="px-3 py-2">最近活跃</th>
                  <th className="px-3 py-2">最近问卷</th>
                  <th className="px-3 py-2">最近反馈</th>
                  <th className="px-3 py-2">最近一局</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((u) => (
                  <tr key={u.id} className="shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
                    <td className="px-3 py-2">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {u.id.startsWith("guest:") ? (
                          <span className="rounded-lg bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-100">游客</span>
                        ) : null}
                        {u.name}
                      </span>
                    </td>
                    <td className="px-3 py-2">{u.isOnline === 1 ? "在线" : "离线"}</td>
                    <td className="px-3 py-2">{Number(u.tokensUsed ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2">{formatPlayTimeFromDbSeconds(u.playTime ?? 0)}</td>
                    <td className="px-3 py-2">{formatPlayTimeFromDbSeconds(u.sessionPlaySec ?? 0)}</td>
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
                    <td className="px-3 py-2">
                      {u.latestGameMaxFloor != null
                        ? `层 ${u.latestGameMaxFloor} / ${formatPlayTimeFromDbSeconds(u.latestGameSurvivalSec ?? 0)}`
                        : "暂无"}
                    </td>
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
        </PanelFrame>
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
                  {surveyDetail.createdAt ? `提交时间（UTC）：${formatZhCnUtcDateTime(surveyDetail.createdAt)}` : "提交时间：未知"}
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

