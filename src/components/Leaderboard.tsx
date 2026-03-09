"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getExplorationLeaderboard,
  getKillLeaderboard,
  type ExplorationLeaderboardResult,
  type KillLeaderboardResult,
} from "@/app/actions/leaderboard";

type LeaderboardProps = {
  userId?: string;
};

function topRankClass(rank: number): string {
  if (rank === 1) return "text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.45)] font-bold";
  if (rank === 2) return "text-slate-200 drop-shadow-[0_0_10px_rgba(226,232,240,0.5)] font-bold";
  if (rank === 3) return "text-orange-300 drop-shadow-[0_0_10px_rgba(253,186,116,0.45)] font-bold";
  return "text-slate-300";
}

export default function Leaderboard({ userId }: LeaderboardProps) {
  const [tab, setTab] = useState<"kill" | "explore">("kill");
  const [killData, setKillData] = useState<KillLeaderboardResult>({ top10: [], currentUser: null });
  const [exploreData, setExploreData] = useState<ExplorationLeaderboardResult>({ top10: [], currentUser: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      const [kill, explore] = await Promise.all([
        getKillLeaderboard(userId),
        getExplorationLeaderboard(userId),
      ]);
      if (!active) return;
      setKillData(kill);
      setExploreData(explore);
      setLoading(false);
    };
    void run();
    return () => {
      active = false;
    };
  }, [userId]);

  const list = useMemo(() => {
    if (tab === "kill") {
      return killData.top10.map((item) => ({
        key: `${item.userId}-kill`,
        rank: item.rank,
        name: item.userName,
        metric: `${item.killedAnomalies} 只`,
        extra: `存活 ${item.survivalTimeSeconds}s`,
      }));
    }
    return exploreData.top10.map((item) => ({
      key: `${item.userId}-explore`,
      rank: item.rank,
      name: item.userName,
      metric: item.floorText,
      extra: item.survivalText,
    }));
  }, [exploreData.top10, killData.top10, tab]);

  const current = tab === "kill" ? killData.currentUser : exploreData.currentUser;

  return (
    <section className="mt-14 w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-5 text-slate-300 shadow-[0_0_30px_rgba(255,255,255,0.1)] backdrop-blur-2xl transition-all duration-700 hover:shadow-[0_0_50px_rgba(255,255,255,0.2)]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg tracking-[0.2em] text-white">深渊排行榜</h2>
        <div className="inline-flex rounded-full border border-white/10 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => setTab("kill")}
            className={`rounded-full px-4 py-1.5 text-xs transition ${
              tab === "kill" ? "bg-white/20 text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            猎杀榜
          </button>
          <button
            type="button"
            onClick={() => setTab("explore")}
            className={`rounded-full px-4 py-1.5 text-xs transition ${
              tab === "explore" ? "bg-white/20 text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            探索榜
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-5 text-sm text-slate-300">排行榜加载中...</div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-5 text-sm text-slate-300">暂无排行数据</div>
        ) : (
          list.map((item) => (
            <div
              key={item.key}
              className="grid grid-cols-[70px_1fr_110px_90px] items-center rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm"
            >
              <span className={topRankClass(item.rank)}>#{item.rank}</span>
              <span className="truncate text-white">{item.name}</span>
              <span className="text-right text-slate-200">{item.metric}</span>
              <span className="text-right text-xs text-slate-400">{item.extra}</span>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 border-t border-white/20 pt-4">
        {current ? (
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 shadow-[0_0_16px_rgba(255,255,255,0.08)]">
            <p className="text-xs text-slate-300">当前玩家</p>
            <div className="mt-1 grid grid-cols-[70px_1fr_120px] items-center text-sm">
              <span className="text-white">#{current.rank}</span>
              <span className="truncate text-white">{current.userName}</span>
              <span className="text-right text-slate-200">
                {tab === "kill" ? `${current.killedAnomalies} 只` : current.floorText}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-400">暂未入榜</div>
        )}
      </div>
    </section>
  );
}
