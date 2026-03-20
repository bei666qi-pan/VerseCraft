"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DashboardUserRow = {
  id: string;
  name: string;
  tokensUsed: number;
  playTime: number;
  lastActive: string | Date;
  isOnline: number;
  feedbackContent: string;
  feedbackCreatedAt: string | null;
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

const PAGE_SIZE = 12;
const REFRESH_MS = 15000;

function formatPlayTime(totalSeconds: number): string {
  const sec = Math.max(0, Math.trunc(Number(totalSeconds) || 0));
  return `${Math.floor(sec / 3600)}小时${Math.floor((sec % 3600) / 60)}分`;
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
  const [overview, setOverview] = useState<any>(null);
  const [realtime, setRealtime] = useState<any>(null);
  const [retention, setRetention] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [feedbackInsights, setFeedbackInsights] = useState<any>(null);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [realtimeSeries, setRealtimeSeries] = useState<Array<{ t: string; online: number; sessions: number }>>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [detail, setDetail] = useState<{ userName: string; content: string; createdAt: string | null } | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setErr(null);
    try {
      const [o, r, rt, f, fi, ai, d] = await Promise.all([
        fetch(`/api/admin/overview?range=${range}`, { credentials: "include" }),
        fetch(`/api/admin/retention?range=${range}`, { credentials: "include" }),
        fetch(`/api/admin/realtime`, { credentials: "include" }),
        fetch(`/api/admin/funnel?range=${range}`, { credentials: "include" }),
        fetch(`/api/admin/feedback-insights?range=${range}`, { credentials: "include" }),
        fetch(`/api/admin/ai-insights?range=${range}`, { credentials: "include" }),
        fetch(`/api/admin/dashboard-data`, { credentials: "include" }),
      ]);

      const [ov, re, rtj, fu, fb, aij, dj] = await Promise.all([
        o.json().catch(() => null),
        r.json().catch(() => null),
        rt.json().catch(() => null),
        f.json().catch(() => null),
        fi.json().catch(() => null),
        ai.json().catch(() => null),
        d.json().catch(() => null),
      ]);

      if (!o.ok && !d.ok) throw new Error("后台数据读取失败");
      if (ov) {
        setOverview(ov);
        if (Array.isArray(ov.chartData)) setChartData(ov.chartData);
      }
      if (re) setRetention(re);
      if (rtj) {
        setRealtime(rtj);
        setRealtimeSeries((prev) => [
          ...prev.slice(-23),
          {
            t: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
            online: Number(rtj.onlineUsers ?? 0),
            sessions: Number(rtj.activeSessions ?? 0),
          },
        ]);
      }
      if (fu) setFunnel(fu);
      if (fb) setFeedbackInsights(fb);
      if (aij) setAiInsights(aij);
      if (dj?.rows) setRows(dj.rows);
      if (Array.isArray(dj?.chartData) && !ov?.chartData) setChartData(dj.chartData);
    } catch {
      setErr("数据加载失败，请稍后重试。");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [range]);

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
            <select value={range} onChange={(e) => setRange(e.target.value as any)} className="rounded-xl bg-white/10 px-3 py-2 text-sm backdrop-blur-xl">
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

        {err ? <div className="rounded-2xl bg-red-500/15 p-3 text-sm text-red-100">{err}</div> : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {[
            ["在线人数", cards.online],
            ["活跃会话", cards.sessions],
            ["今日新增", cards.todayNew],
            ["DAU", cards.dau],
            ["WAU", cards.wau],
            ["MAU", cards.mau],
            ["今日Token", cards.todayToken],
            ["平均会话时长", `${Math.floor(cards.avgSessionSec / 60)}分`],
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
            <p className="mt-1 text-xs text-slate-300">Cohort：{Number(retention?.cohortSize ?? 0)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] xl:col-span-2">
            <p className="mb-2 text-sm">漏斗</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(funnel?.stages ?? []).map((s: any) => (
                <div key={String(s.eventName)} className="rounded-xl bg-white/10 p-2">
                  <p className="text-xs text-slate-300">{String(s.eventName)}</p>
                  <p className="text-lg font-semibold">{Number(s.users ?? 0)}</p>
                  <p className="text-xs text-slate-400">{(Number(s.conversionRate ?? 0) * 100).toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] xl:col-span-2">
            <p className="mb-2 text-sm">反馈与问题洞察</p>
            <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-200">
              <span className="rounded-lg bg-white/10 px-2 py-1">反馈 {Number(feedbackInsights?.totalFeedback ?? 0)}</span>
              <span className="rounded-lg bg-white/10 px-2 py-1">负向 {Number(feedbackInsights?.negativeFeedback ?? 0)}</span>
              {(feedbackInsights?.topics ?? []).slice(0, 3).map((t: any) => (
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
            <p className="mb-2 text-sm">AI 洞察</p>
            <div className="space-y-2 text-sm">
              {(aiInsights?.suggestions ?? []).map((s: string, i: number) => (
                <div key={i} className="rounded-xl bg-white/10 p-2">{s}</div>
              ))}
            </div>
          </div>
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
    </main>
  );
}

