"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSettlementHistoryPage } from "@/app/actions/history";
import { useAchievementsStore, type AchievementRecord } from "@/store/useAchievementsStore";

function formatCreatedAt(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

function HistoryCard({ record }: { record: AchievementRecord }) {
  const created = formatCreatedAt(record.createdAt);
  const review = [record.reviewLine1, record.reviewLine2].filter(Boolean).join(" ");

  return (
    <article
      data-testid="history-record-card"
      className="relative grid min-h-[8.4rem] grid-cols-[4.15rem_minmax(0,1fr)] gap-4 rounded-[18px] border border-[#0d5a4e] bg-[#fffdf8]/62 px-4 py-4 text-[#0d5a4e] shadow-[0_8px_22px_rgba(72,55,35,0.08)] sm:grid-cols-[6rem_1fr_1fr_1fr] sm:items-center sm:px-8 sm:py-5"
    >
      <div className="vc-reading-serif flex h-full items-center justify-center border-r border-[#0d5a4e]/55 pr-4 text-[3.3rem] font-semibold leading-none drop-shadow-[0_3px_8px_rgba(15,90,82,0.16)] sm:pr-8 sm:text-[4.6rem]">
        {record.grade}
      </div>
      <div className="grid min-w-0 gap-3 sm:col-span-3 sm:grid-cols-3 sm:gap-0">
        <div className="min-w-0 sm:border-r sm:border-[#0d5a4e]/45 sm:px-7">
          <div className="vc-reading-serif text-[1rem] leading-none">存活时间</div>
          <div className="vc-reading-serif mt-3 truncate text-[1.45rem] font-semibold leading-none sm:text-[1.65rem]">
            {record.survivalTimeText}
          </div>
        </div>
        <div className="min-w-0 sm:border-r sm:border-[#0d5a4e]/45 sm:px-7">
          <div className="vc-reading-serif text-[1rem] leading-none">消灭诡异</div>
          <div className="vc-reading-serif mt-3 truncate text-[1.45rem] font-semibold leading-none sm:text-[1.65rem]">
            {record.kills} 只
          </div>
        </div>
        <div className="min-w-0 sm:px-7">
          <div className="vc-reading-serif text-[1rem] leading-none">最高抵达</div>
          <div className="vc-reading-serif mt-3 truncate text-[1.45rem] font-semibold leading-none sm:text-[1.65rem]">
            {record.maxFloorDisplay}
          </div>
        </div>
      </div>
      {review || created ? (
        <div className="col-span-2 min-w-0 border-t border-[#0d5a4e]/18 pt-3 text-[12px] leading-relaxed text-[#49645e] sm:col-span-4">
          {review ? <span className="line-clamp-2">{review}</span> : null}
          {created ? <span className="mt-1 block text-[#6d746e]">{created}</span> : null}
        </div>
      ) : null}
    </article>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const records = useAchievementsStore((s) => s.records);
  const mergeRemoteHistoryPreview = useAchievementsStore((s) => s.mergeRemoteHistoryPreview);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await useAchievementsStore.persist.rehydrate();
      const remote = await fetchSettlementHistoryPage({ limit: 24 }).catch(() => ({ items: [], total: 0 }));
      if (!cancelled && remote.items.length > 0) {
        mergeRemoteHistoryPreview(remote.items);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [mergeRemoteHistoryPreview]);

  const visibleRecords = useMemo(() => records.slice(0, 12), [records]);

  return (
    <main
      data-testid="history-page"
      className="relative min-h-[100dvh] overflow-hidden bg-[#f6f2ec] px-4 py-8 text-[#0d5a4e] sm:px-8 sm:py-16"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(79,65,45,0.08)_0.7px,transparent_0.7px)] [background-size:10px_10px]" aria-hidden />
      <section className="relative mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-[980px] rounded-[30px] border border-[#decfbb] bg-[#fffdf8]/94 px-[clamp(1.5rem,6vw,5.8rem)] py-[clamp(2rem,6vw,5.4rem)] shadow-[0_24px_74px_rgba(76,61,42,0.16),inset_0_0_0_9px_rgba(248,243,235,0.95),inset_0_0_0_10px_rgba(218,207,191,0.72),inset_0_0_0_22px_rgba(255,253,248,0.9),inset_0_0_0_23px_rgba(226,216,200,0.62)] sm:rounded-[42px]">
        <header className="flex items-start justify-between gap-4">
          <h1 className="vc-reading-serif text-[clamp(2.7rem,12vw,5.4rem)] font-semibold leading-none text-[#0d5a4e]">
            历史记录
          </h1>
          <button
            type="button"
            data-testid="history-close"
            onClick={() => router.push("/")}
            className="vc-reading-serif mt-1 shrink-0 rounded-full border border-[#0d5a4e] bg-[#fffdf8]/82 px-5 py-2.5 text-[1.15rem] font-semibold text-[#0d5a4e] transition hover:bg-[#f8f2e8] sm:px-8 sm:text-[1.45rem]"
          >
            关闭
          </button>
        </header>

        <div className="mt-[clamp(2.2rem,7vw,4.5rem)] space-y-5">
          {!loaded ? (
            <div className="vc-reading-serif rounded-[18px] border border-[#0d5a4e]/65 bg-[#fffdf8]/62 px-6 py-8 text-center text-[1.25rem]">
              正在读取履历...
            </div>
          ) : visibleRecords.length > 0 ? (
            visibleRecords.map((record) => <HistoryCard key={`${record.createdAt}-${record.grade}-${record.maxFloor}-${record.kills}`} record={record} />)
          ) : (
            <div className="vc-reading-serif rounded-[18px] border border-[#0d5a4e]/65 bg-[#fffdf8]/62 px-6 py-10 text-center text-[1.25rem] leading-relaxed">
              暂无历史记录。完成一次结算后，这里会自动保留本机履历；登录后也会合并云端履历。
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
