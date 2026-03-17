"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type DashboardUserRow = {
  id: string;
  name: string;
  tokensUsed: number;
  todayTokensUsed: number;
  playTime: number;
  todayPlayTime: number;
  lastActive: string | Date;
  isOnline: number;
  feedbackPreview: string;
  feedbackContent: string;
  feedbackCreatedAt: string | null;
};

type ChartPoint = { date: string; users: number; tokens: number; activeUsers?: number };

type AdminDashboardClientProps = {
  rows: DashboardUserRow[];
  onlineCount: number;
  totalUsers: number;
  totalTokens: number;
  /** Optional: for local preview, skip API fetch */
  chartData?: ChartPoint[];
};

function formatPlayTime(totalSeconds: number): string {
  const sec = Number.isFinite(totalSeconds) ? Math.max(0, Math.trunc(totalSeconds)) : 0;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return `${hours}小时${minutes}分`;
}

function formatTokenCost(tokens: number): string {
  const fee = (tokens / 1_000_000) * 4;
  return fee.toFixed(4);
}

function normalizeToken(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function formatLastOnline(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN");
}

const REFRESH_INTERVAL_MS = 30_000;
const TABLE_PAGE_SIZE = 15;

export default function AdminDashboardClient({
  rows: rowsProp,
  onlineCount: onlineCountProp,
  totalUsers: totalUsersProp,
  totalTokens: totalTokensProp,
  chartData: chartDataProp,
}: AdminDashboardClientProps) {
  const [rows, setRows] = useState(rowsProp);
  const [onlineCount, setOnlineCount] = useState(onlineCountProp);
  const [totalUsers, setTotalUsers] = useState(totalUsersProp);
  const [totalTokens, setTotalTokens] = useState(totalTokensProp);
  const [mode, setMode] = useState<"today" | "total">("today");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "charts">("table");
  const [tablePage, setTablePage] = useState(1);
  const [chartData, setChartData] = useState<ChartPoint[]>(chartDataProp ?? []);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const chartsRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRows(rowsProp);
    setOnlineCount(onlineCountProp);
    setTotalUsers(totalUsersProp);
    setTotalTokens(totalTokensProp);
    setChartData(chartDataProp ?? []);
  }, [rowsProp, onlineCountProp, totalUsersProp, totalTokensProp, chartDataProp]);

  const [detail, setDetail] = useState<{
    userName: string;
    content: string;
    createdAt: string | null;
  } | null>(null);

  const tableRows = useMemo(
    () =>
      rows.map((user) => {
        const todayToken = normalizeToken(user.todayTokensUsed);
        const totalToken = normalizeToken(user.tokensUsed);
        const tokenValue = mode === "today" ? todayToken : totalToken;
        const playTimeValue = mode === "today" ? user.todayPlayTime : user.playTime;
        const todaySec = Number(user.todayPlayTime) ?? 0;
        const totalSec = Number(user.playTime) ?? 0;
        const lastActiveMs =
          user.lastActive instanceof Date
            ? user.lastActive.getTime()
            : new Date(String(user.lastActive)).getTime();
        const daysSinceActive = Math.max(
          1,
          Math.ceil((Date.now() - lastActiveMs) / 86400000)
        );
        const avgSecPerDay = totalSec / daysSinceActive;
        const isActive =
          mode === "today"
            ? todaySec >= 1800
            : avgSecPerDay >= 900;
        return {
          ...user,
          todayToken,
          totalToken,
          tokenValue,
          playTimeValue,
          isActive,
        };
      }),
    [mode, rows]
  );

  const fetchChartData = useCallback(() => {
    if (chartDataProp) return;
    fetch("/api/admin/stats", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => Array.isArray(d.chartData) && setChartData(d.chartData))
      .catch(() => {});
  }, [chartDataProp]);

  const fetchDashboardData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/admin/dashboard-data", { credentials: "include" });
      if (!res.ok) return;
      const d = await res.json();
      if (d.rows) setRows(d.rows);
      if (typeof d.onlineCount === "number") setOnlineCount(d.onlineCount);
      if (typeof d.totalUsers === "number") setTotalUsers(d.totalUsers);
      if (typeof d.totalTokens === "number") setTotalTokens(d.totalTokens);
      if (Array.isArray(d.chartData)) setChartData(d.chartData);
    } catch {
      // Silent fail
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(handleRefresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, handleRefresh]);

  useEffect(() => {
    if (chartDataProp) {
      setChartData(chartDataProp);
      return;
    }
    fetchChartData();
  }, [chartDataProp, fetchChartData]);

  const totalTablePages = Math.max(1, Math.ceil(tableRows.length / TABLE_PAGE_SIZE));
  const paginatedRows = useMemo(
    () =>
      tableRows.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE),
    [tableRows, tablePage]
  );

  useEffect(() => {
    if (tablePage > totalTablePages) setTablePage(1);
  }, [tablePage, totalTablePages]);

  const chartWithDeltas = useMemo(() => {
    if (chartData.length < 2) return chartData;
    return chartData.map((p, i) => ({
      ...p,
      dailyTokens: i === 0 ? (p.tokens ?? 0) : Math.max(0, (p.tokens ?? 0) - (chartData[i - 1]!.tokens ?? 0)),
      activeUsers: p.activeUsers ?? 0,
    }));
  }, [chartData]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 p-8 text-slate-800">
      <section className="relative z-10 mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[0.12em] text-slate-800">控制台</h1>
            <p className="mt-2 text-sm text-slate-500">运营监控与用户数据总览</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = viewMode === "table" ? "charts" : "table";
              setViewMode(next);
              requestAnimationFrame(() => {
                (next === "charts" ? chartsRef : tableRef).current?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
            className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            {viewMode === "table" ? "📊 可视化图表" : "📋 数据表格"}
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200/50 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
            <p className="text-xs tracking-[0.18em] text-slate-500">当前在线</p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">{onlineCount}</p>
          </div>
          <div className="rounded-3xl border border-slate-200/50 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
            <p className="text-xs tracking-[0.18em] text-slate-500">累计 Token 消耗</p>
            <p className="mt-3 text-2xl font-semibold text-slate-800">
              {(totalTokens / 1_000_000).toFixed(2)}M
            </p>
            <p className="mt-1 text-xs text-slate-400">约 ￥{formatTokenCost(totalTokens)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200/50 bg白/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
            <p className="text-xs tracking-[0.18em] text-slate-500">注册用户总数</p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">{totalUsers}</p>
          </div>
        </div>

        {viewMode === "charts" && (
          <>
        {chartData.length > 0 ? (
          <div ref={chartsRef} className="mt-8">
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200/50 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
                <p className="mb-4 text-sm font-medium tracking-wide text-slate-600">Token 日消耗</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartWithDeltas}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}百万` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}千` : String(v))} />
                      <Tooltip
                        formatter={(v: number) => [v.toLocaleString(), "Token"]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                      />
                      <Bar dataKey="dailyTokens" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200/50 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
                <p className="mb-4 text-sm font-medium tracking-wide text-slate-600">用户日活</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartWithDeltas}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <Tooltip
                        formatter={(v: number) => [v, "日活"]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                      />
                      <Bar dataKey="activeUsers" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200/50 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl lg:col-span-2">
                <p className="mb-4 text-sm font-medium tracking-wide text-slate-600">累计 Token 消耗趋势</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${(v / 1e6).toFixed(1)}百万`} />
                      <Tooltip
                        formatter={(v: number) => [(v / 1_000_000).toFixed(2) + " 百万", "Token"]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                      />
                      <Area type="monotone" dataKey="tokens" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div ref={chartsRef} className="mt-8 rounded-3xl border border-slate-200/50 bg-white/70 p-8 text-center text-slate-500 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
            暂无图表数据，请点击刷新或稍后再试
          </div>
        )}
          </>
        )}

        {viewMode === "table" && (
        <div ref={tableRef} className="mt-8 rounded-3xl border border-slate-200/50 bg-white/70 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="rounded-full border border-slate-200 bg-white/80 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
              >
                {isRefreshing ? "刷新中..." : "刷新"}
              </button>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-slate-300"
                />
                每30秒自动刷新
              </label>
            </div>
            <div className="inline-flex rounded-full border border-slate-200 bg-white/80 p-1">
              <button
                type="button"
                onClick={() => setMode("today")}
                className={`rounded-full px-4 py-1.5 text-sm transition-all ${
                  mode === "today"
                    ? "bg-slate-800 text-white shadow-[0_6px_18px_rgba(15,23,42,0.22)]"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                今日数据
              </button>
              <button
                type="button"
                onClick={() => setMode("total")}
                className={`rounded-full px-4 py-1.5 text-sm transition-all ${
                  mode === "total"
                    ? "bg-slate-800 text-white shadow-[0_6px_18px_rgba(15,23,42,0.22)]"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                总计数据
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-200/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-slate-200/70 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">账号名</th>
                  <th className="px-5 py-4 font-medium">{mode === "today" ? "今日时长" : "累计时长"}</th>
                  <th className="px-5 py-4 font-medium">{mode === "today" ? "今日 Token" : "累计 Token"}</th>
                  <th className="px-5 py-4 font-medium">用户意见</th>
                  <th className="px-5 py-4 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((user) => {
                  const active = user.isOnline === 1;
                  const cost = formatTokenCost(user.tokenValue);
                  return (
                    <tr key={user.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-5 py-4">
                        <span
                          className={
                            user.isActive
                              ? "font-medium text-slate-800 drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]"
                              : "text-slate-700"
                          }
                        >
                          {user.name}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{formatPlayTime(user.playTimeValue)}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {user.tokenValue.toLocaleString()}（约 ￥{cost}）
                        <div className="mt-1 text-xs text-slate-400">总计 {user.totalToken.toLocaleString()}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {user.feedbackContent ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDetail({
                                userName: user.name,
                                content: user.feedbackContent,
                                createdAt: user.feedbackCreatedAt,
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                          >
                            {user.feedbackPreview}
                            {user.feedbackContent.length > 6 ? "..." : ""}
                            <span className="text-slate-400">查看详情</span>
                          </button>
                        ) : (
                          <span className="text-slate-400">暂无</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {active ? (
                          <span className="inline-flex items-center gap-2 text-emerald-600">
                            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.65)]" />
                            在线
                          </span>
                        ) : (
                          <div className="inline-flex flex-col gap-1 text-slate-500">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                              离线
                            </span>
                            <span className="text-xs text-slate-400" suppressHydrationWarning>
                              最后在线：{formatLastOnline(user.lastActive)}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalTablePages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-200/70 pt-4">
              <p className="text-sm text-slate-500">
                第 {tablePage} / {totalTablePages} 页，共 {tableRows.length} 人
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  disabled={tablePage <= 1}
                  className="rounded-full border border-slate-200 bg-white/80 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))}
                  disabled={tablePage >= totalTablePages}
                  className="rounded-full border border-slate-200 bg-white/80 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
        )}
      </section>

      {detail && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/20 p-6 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setDetail(null)}
          />
          <div className="relative w-full max-w-xl rounded-3xl border border-slate-200/60 bg-white/95 p-6 shadow-[0_16px_50px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">意见详情</h3>
                <p className="mt-1 text-xs text-slate-500">
                  来自账号：{detail.userName}
                  {detail.createdAt ? (
                    <span suppressHydrationWarning>
                      {` · ${new Date(detail.createdAt).toLocaleString("zh-CN")}`}
                    </span>
                  ) : (
                    ""
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:text-slate-800"
              >
                关闭
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {detail.content}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
