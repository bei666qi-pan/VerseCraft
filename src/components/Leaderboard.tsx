"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import {
  getExplorationLeaderboard,
  type ExplorationLeaderboardResult,
} from "@/app/actions/leaderboard";

type LeaderboardProps = {
  userId?: string;
  /** Where to place the trigger button. `fixed` shows bottom-left floating button. */
  triggerPlacement?: "fixed" | "inline";
  /** When true, open the leaderboard modal on mount (useful for #hash deep links). */
  defaultOpen?: boolean;
};

function topRankClass(rank: number): string {
  if (rank === 1) return "text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.45)] font-bold";
  if (rank === 2) return "text-slate-200 drop-shadow-[0_0_10px_rgba(226,232,240,0.5)] font-bold";
  if (rank === 3) return "text-orange-300 drop-shadow-[0_0_10px_rgba(253,186,116,0.45)] font-bold";
  return "text-slate-300";
}

export default function Leaderboard({
  userId,
  triggerPlacement = "fixed",
  defaultOpen = false,
}: LeaderboardProps) {
  const [open, setOpen] = useState(false);
  const [exploreData, setExploreData] = useState<ExplorationLeaderboardResult>({ top10: [], currentUser: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!defaultOpen) return;
    setOpen(true);
  }, [defaultOpen]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const explore = await getExplorationLeaderboard(userId);
        if (!active) return;
        setExploreData(explore);
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [open, userId]);

  const list = useMemo(() => {
    return exploreData.top10.map((item) => ({
      key: `${item.userId}-explore`,
      rank: item.rank,
      name: item.userName,
      metric: item.floorText,
      extra: item.survivalText,
    }));
  }, [exploreData.top10]);

  const current = exploreData.currentUser;

  return (
    <>
      <button
        type="button"
        className={triggerPlacement === "fixed" ? "fixed bottom-8 left-8 z-50" : "relative"}
        onClick={() => setOpen(true)}
        aria-label="打开深渊排行榜"
      >
        <div className="group relative flex h-[70px] w-[70px] cursor-pointer items-center justify-center rounded-full border border-[#d8d3ca] bg-[#f8f5ef]/90 shadow-[0_18px_36px_rgba(62,72,68,0.10),inset_0_1px_0_rgba(255,255,255,0.88),inset_0_-2px_5px_rgba(106,100,88,0.06)] transition hover:bg-[#fbf8f3] active:scale-[0.98]">
          <Trophy className="relative z-10 text-[#164f4d]" size={25} />
        </div>
      </button>

      <div
        className={`fixed inset-0 z-[85] flex items-center justify-center p-6 transition-all duration-500 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className={`absolute inset-0 bg-slate-200/50 backdrop-blur-sm transition-all duration-500 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        <section
          className={`relative w-full max-w-4xl rounded-[2rem] border border-white bg-slate-100/90 p-8 shadow-[0_0_40px_rgba(200,200,200,0.5)] backdrop-blur-3xl transition-all duration-500 ${
            open ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg tracking-[0.2em] text-slate-700">排行榜</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs text-slate-500 transition hover:text-slate-800"
            >
              关闭
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-5 text-sm text-slate-500">
                排行榜加载中...
              </div>
            ) : list.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-5 text-sm text-slate-500">
                暂无排名
              </div>
            ) : (
              list.map((item) => (
                <div
                  key={item.key}
                  className="grid grid-cols-[70px_1fr_130px_90px] items-center rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm"
                >
                  <span className={topRankClass(item.rank)}>#{item.rank}</span>
                  <span className="truncate text-slate-700">{item.name}</span>
                  <span className="text-right text-slate-600">{item.metric}</span>
                  <span className="text-right text-xs text-slate-400">{item.extra}</span>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 border-t border-white/20 pt-4">
            {current ? (
              <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-[0_0_16px_rgba(255,255,255,0.35)]">
                <p className="text-xs text-slate-500">当前玩家</p>
                <div className="mt-1 grid grid-cols-[70px_1fr_130px] items-center text-sm">
                  <span className="text-slate-700">#{current.rank}</span>
                  <span className="truncate text-slate-700">{current.userName}</span>
                  <span className="text-right text-slate-600">
                    {"floorText" in current ? current.floorText : "-"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-500">暂未入榜</div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
