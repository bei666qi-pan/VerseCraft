"use client";

import { useMemo, useState } from "react";

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

type ServerMetrics = {
  cpuLoadPercent: number;
  memoryUsagePercent: number;
  onlineCapacityEstimate: number;
};

type AdminDashboardClientProps = {
  metrics: ServerMetrics;
  rows: DashboardUserRow[];
  onlineCount: number;
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

export default function AdminDashboardClient({ metrics, rows, onlineCount }: AdminDashboardClientProps) {
  const [mode, setMode] = useState<"today" | "total">("today");
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
        return {
          ...user,
          todayToken,
          totalToken,
          tokenValue,
          playTimeValue,
        };
      }),
    [mode, rows]
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 p-8 text-slate-800">
      <section className="relative z-10 mx-auto max-w-7xl">
        <h1 className="text-2xl font-semibold tracking-[0.12em] text-slate-800">控制台</h1>
        <p className="mt-2 text-sm text-slate-500">运营监控与玩家数据总览</p>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200/50 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
            <p className="text-xs tracking-[0.18em] text-slate-500">CPU 负载</p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">{metrics.cpuLoadPercent.toFixed(1)}%</p>
          </div>
          <div className="rounded-3xl border border-slate-200/50 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
            <p className="text-xs tracking-[0.18em] text-slate-500">内存占用</p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">{metrics.memoryUsagePercent.toFixed(1)}%</p>
          </div>
          <div className="rounded-3xl border border-slate-200/50 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
            <p className="text-xs tracking-[0.18em] text-slate-500">在线 / 承载</p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">
              {onlineCount} / {metrics.onlineCapacityEstimate}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-slate-200/50 bg-white/70 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
          <div className="mb-4 flex justify-end">
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
                  <th className="px-5 py-4 font-medium">玩家意见</th>
                  <th className="px-5 py-4 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((user) => {
                  const active = user.isOnline === 1;
                  const cost = formatTokenCost(user.tokenValue);
                  return (
                    <tr key={user.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-5 py-4 text-slate-700">{user.name}</td>
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
                            <span className="text-xs text-slate-400">最后在线：{formatLastOnline(user.lastActive)}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
                  {detail.createdAt ? ` · ${new Date(detail.createdAt).toLocaleString("zh-CN")}` : ""}
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
