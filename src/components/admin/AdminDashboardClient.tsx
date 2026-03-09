"use client";

import { useMemo, useState } from "react";

type DashboardUserRow = {
  id: string;
  name: string;
  tokensUsed: number;
  todayTokensUsed: number;
  playTime: number;
  todayPlayTime: number;
  isOnline: number;
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

export default function AdminDashboardClient({ metrics, rows, onlineCount }: AdminDashboardClientProps) {
  const [mode, setMode] = useState<"today" | "total">("today");

  const tableRows = useMemo(
    () =>
      rows.map((user) => {
        const tokenValue = mode === "today" ? user.todayTokensUsed : user.tokensUsed;
        const playTimeValue = mode === "today" ? user.todayPlayTime : user.playTime;
        return {
          ...user,
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
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200/70 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">账号名</th>
                  <th className="px-5 py-4 font-medium">{mode === "today" ? "今日时长" : "累计时长"}</th>
                  <th className="px-5 py-4 font-medium">{mode === "today" ? "今日 Token" : "累计 Token"}</th>
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
                      </td>
                      <td className="px-5 py-4">
                        {active ? (
                          <span className="inline-flex items-center gap-2 text-emerald-600">
                            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.65)]" />
                            在线
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-slate-500">
                            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                            离线
                          </span>
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
    </main>
  );
}
