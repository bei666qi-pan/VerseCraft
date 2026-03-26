"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchSettlementHistoryPage,
  fetchSettlementWritingMarkdown,
} from "@/app/actions/history";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { useAchievementsStore } from "@/store/useAchievementsStore";

type Row = Awaited<ReturnType<typeof fetchSettlementHistoryPage>>["items"][number];

function formatSettledAt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(t);
  } catch {
    return iso.slice(0, 16);
  }
}

function formatMmSs(seconds: number): string {
  const s = Math.max(0, Math.trunc(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function HistoryPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSettlementHistoryPage({ limit: 40 });
      setItems(res.items);
      setTotal(res.total);
      if (res.items.length > 0) {
        useAchievementsStore.getState().mergeRemoteHistoryPreview(
          res.items.map((it) => ({
            createdAt: it.createdAt,
            grade: it.grade,
            survivalDay: it.survivalDay,
            survivalHour: it.survivalHour,
            killedAnomalies: it.killedAnomalies,
            maxFloorScore: it.maxFloorScore,
            maxFloorLabel: it.maxFloorLabel,
            recapSummary: it.recapSummary,
            aiRecapSummary: it.aiRecapSummary,
          }))
        );
      }
    } catch {
      setError("暂时无法加载履历，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void trackGameplayEvent({
      eventName: "history_center_viewed",
      page: "/history",
      source: "history_center",
      payload: {},
    }).catch(() => {});
  }, []);

  async function handleDownloadWriting(row: Row) {
    const { markdown } = await fetchSettlementWritingMarkdown(row.id);
    if (!markdown) {
      window.alert("该条履历没有可用的写作快照（可能为早期版本或生成失败）。");
      return;
    }
    void trackGameplayEvent({
      eventName: "history_writing_downloaded",
      page: "/history",
      source: "history_center",
      payload: { historyId: row.id },
    }).catch(() => {});
    const safe = formatSettledAt(row.createdAt).replace(/[/\\?%*:|"<>]/g, "-");
    triggerDownload(markdown, `versecraft-书写快照-${safe}.md`);
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-10 border-b border-slate-200/80 pb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">VerseCraft</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">书写履历</h1>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600">
            这里保存你每次「封卷」留下的摘要与可选的写作快照。数据随账号同步，换设备仍可回看自己写过什么、走得有多远——不是排行榜的分数，而是你自己的时间线。
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link
              href="/"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              返回首页
            </Link>
            <Link
              href="/#home-leaderboard"
              className="rounded-full border border-transparent px-4 py-2 font-medium text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
            >
              排行榜
            </Link>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-sm text-slate-600">暂无账号履历。</p>
            <p className="mt-2 text-xs text-slate-500">
              登录后在任意一局完成结算，即会在此留下记录；你也可以在局内菜单的「成就」里看到本机预览。
            </p>
          </div>
        ) : (
          <>
            <p className="mb-6 text-xs text-slate-500">
              共 <span className="font-semibold text-slate-700">{total}</span> 条；本页展示最近 {items.length} 条。
            </p>
            <ul className="space-y-5">
              {items.map((row) => (
                <li
                  key={row.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">{row.grade}</span>
                      <span className="text-xs text-slate-500">{formatSettledAt(row.createdAt)}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      {row.isDead ? "死亡封卷" : row.hasEscaped ? "逃离" : "中断 / 他途"}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                    {row.aiRecapSummary?.trim() || row.recapSummary}
                  </p>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-slate-400">存活</dt>
                      <dd className="font-medium text-slate-800">
                        {row.survivalDay} 日 {row.survivalHour} 时 · {formatMmSs(row.survivalTimeSeconds)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">消灭诡异</dt>
                      <dd className="font-medium text-slate-800">{row.killedAnomalies} 只</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">最高抵达</dt>
                      <dd className="font-medium text-slate-800">{row.maxFloorLabel || `第 ${row.maxFloorScore} 层`}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">职业</dt>
                      <dd className="font-medium text-slate-800">{row.profession?.trim() || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">结局标记</dt>
                      <dd className="font-medium text-slate-800">{row.outcome}</dd>
                    </div>
                  </dl>

                  {row.hasWritingMarkdown ? (
                    <button
                      type="button"
                      onClick={() => void handleDownloadWriting(row)}
                      className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 sm:w-auto sm:px-5"
                    >
                      下载本次写作快照 (.md)
                    </button>
                  ) : (
                    <p className="mt-4 text-[11px] text-slate-400">该条未保存写作快照。</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
