"use client";

// src/components/leaderboard/LeaderboardList.tsx
//
// add-public-leaderboard：客户端列表与筛选组件。
// - 拉取 /api/leaderboard envelope。
// - SSR 安全：useMounted 守 hydration；首屏骨架渲染。
// - outcome 切换（全部 / 生存 / 死亡 / 逃脱）。
// - 当前用户高亮（依赖 session.user.id 由父组件注入）。

import { useEffect, useMemo, useState } from "react";
import type { LeaderboardEntry } from "@/lib/leaderboard/repository";
import { useMounted } from "@/hooks/useMounted";

export type OutcomeFilter = "all" | "died" | "survived" | "escaped";

export type LeaderboardData = {
  entries: LeaderboardEntry[];
  totalReturned: number;
  page: number;
  limit: number;
  requiresLogin: boolean;
};

type Envelope = {
  ok: boolean;
  data: LeaderboardData | null;
  degraded: boolean;
  reason: string | null;
};

type Props = {
  initialData?: LeaderboardData | null;
  initialDegraded?: boolean;
  initialReason?: string | null;
  currentUserId?: string | null;
};

const OUTCOME_LABELS: Record<OutcomeFilter, string> = {
  all: "全部",
  died: "死亡",
  survived: "生存",
  escaped: "逃脱",
};

function formatRelative(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const now = Date.now();
  const delta = now - t;
  if (delta < 60_000) return "刚刚";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 日前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  const years = Math.floor(months / 12);
  return `${years} 年前`;
}

function rankBadge(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

function entryKey(entry: LeaderboardEntry): string {
  return `${entry.userId}-${entry.createdAt}-${entry.maxFloorScore}`;
}

export function LeaderboardList({
  initialData,
  initialDegraded = false,
  initialReason = null,
  currentUserId = null,
}: Props) {
  const mounted = useMounted();
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [data, setData] = useState<LeaderboardData | null>(initialData ?? null);
  const [degraded, setDegraded] = useState<boolean>(initialDegraded);
  const [reason, setReason] = useState<string | null>(initialReason);
  const [loading, setLoading] = useState<boolean>(initialData == null);

  const fetchUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (outcome !== "all") params.set("outcome", outcome);
    params.set("limit", "25");
    return `/api/leaderboard?${params.toString()}`;
  }, [outcome]);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(fetchUrl, { method: "GET", credentials: "same-origin" });
        const json = (await res.json()) as Envelope;
        if (cancelled) return;
        setData(json.data);
        setDegraded(Boolean(json.degraded) || !json.ok);
        setReason(json.reason ?? null);
      } catch (err) {
        if (cancelled) return;
        setData(null);
        setDegraded(true);
        setReason("leaderboard_fetch_failed");
        console.error("[LeaderboardList] fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchUrl, mounted]);

  if (!mounted) {
    return (
      <div
        data-testid="leaderboard-loading"
        className="vc-reading-serif rounded-[18px] border border-vc-line bg-vc-paper-bright/80 px-6 py-10 text-center text-[1.25rem] text-vc-ink-soft"
      >
        正在读取排行榜…
      </div>
    );
  }

  if (data?.requiresLogin) {
    return (
      <div
        data-testid="leaderboard-requires-login"
        className="vc-reading-serif rounded-[18px] border border-vc-line bg-vc-paper-bright/80 px-6 py-10 text-center text-[1.25rem] leading-relaxed text-vc-ink-soft"
      >
        登录后即可参与玩家排名。登录后你的最佳结算会自动上榜。
      </div>
    );
  }

  const entries = data?.entries ?? [];

  return (
    <div data-testid="leaderboard-list" className="space-y-4">
      <div
        data-testid="leaderboard-filter-row"
        className="flex flex-wrap items-center gap-2"
        role="tablist"
        aria-label="按结局类型筛选"
      >
        {(Object.keys(OUTCOME_LABELS) as OutcomeFilter[]).map((key) => {
          const active = outcome === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`leaderboard-filter-${key}`}
              onClick={() => setOutcome(key)}
              className={`vc-reading-serif rounded-full border px-4 py-1.5 text-[1rem] transition ${
                active
                  ? "border-vc-accent bg-vc-accent/10 text-vc-ink-deep"
                  : "border-vc-line bg-vc-paper-bright text-vc-ink-soft hover:bg-white"
              }`}
            >
              {OUTCOME_LABELS[key]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div
          data-testid="leaderboard-loading"
          className="vc-reading-serif rounded-[18px] border border-vc-line bg-vc-paper-bright/80 px-6 py-10 text-center text-[1.25rem] text-vc-ink-soft"
        >
          正在读取排行榜…
        </div>
      ) : entries.length === 0 ? (
        <div
          data-testid="leaderboard-empty"
          className="vc-reading-serif rounded-[18px] border border-vc-line bg-vc-paper-bright/80 px-6 py-10 text-center text-[1.25rem] leading-relaxed text-vc-ink-soft"
        >
          暂无符合条件的玩家记录。完成一次结算后，你的最佳成绩会自动上榜。
        </div>
      ) : (
        <ul
          data-testid="leaderboard-rows"
          className="space-y-3"
          aria-label="排行榜条目"
        >
          {entries.map((entry) => {
            const isMe = currentUserId != null && entry.userId === currentUserId;
            return (
              <li
                key={entryKey(entry)}
                data-testid="leaderboard-row"
                data-rank={entry.rank}
                data-current-user={isMe ? "true" : "false"}
                className={`vc-reading-serif grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-4 rounded-[18px] border px-4 py-4 sm:grid-cols-[4rem_3.5rem_minmax(0,1fr)_1fr_1fr] ${
                  isMe
                    ? "border-vc-accent/60 bg-vc-accent/8"
                    : "border-vc-line bg-vc-paper-bright/90"
                }`}
              >
                <div className="text-center text-[1.6rem] font-semibold leading-none text-vc-ink-deep">
                  {rankBadge(entry.rank)}
                </div>
                <div className="text-center text-[2.4rem] font-semibold leading-none text-vc-ink-deep">
                  {entry.grade || "—"}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[1.05rem] font-semibold text-vc-ink-deep">
                    {entry.displayName}
                    {isMe ? (
                      <span className="ml-2 text-[0.85rem] text-vc-accent">（你）</span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[0.85rem] text-vc-ink-faint">
                    {entry.maxFloorLabel || "未记录"} · 消灭 {entry.killedAnomalies} 只
                  </div>
                </div>
                <div className="hidden text-[1rem] text-vc-ink-soft sm:block">
                  {entry.profession || "无职业"}
                </div>
                <div className="hidden text-right text-[0.85rem] text-vc-ink-faint sm:block">
                  {formatRelative(entry.createdAt)}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {degraded && !loading ? (
        <p
          data-testid="leaderboard-degraded-notice"
          className="vc-reading-serif rounded-[14px] border border-amber-300/60 bg-amber-50/70 px-4 py-2 text-center text-[0.95rem] text-amber-900"
        >
          当前展示为降级视图（{reason ?? "leaderboard_unavailable"}），后续会自动重试。
        </p>
      ) : null}
    </div>
  );
}