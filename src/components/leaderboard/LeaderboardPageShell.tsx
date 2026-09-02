"use client";

// src/components/leaderboard/LeaderboardPageShell.tsx
//
// add-public-leaderboard：客户端壳，承载 useRouter 与标题栏。
// - 服务端 page.tsx 仅做 auth() + 渲染此组件。

import { useRouter } from "next/navigation";
import type { LeaderboardData } from "@/components/leaderboard/LeaderboardList";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";

type Props = {
  currentUserId: string | null;
  initialData?: LeaderboardData | null;
  initialDegraded?: boolean;
  initialReason?: string | null;
};

export function LeaderboardPageShell({
  currentUserId,
  initialData,
  initialDegraded = false,
  initialReason = null,
}: Props) {
  const router = useRouter();
  return (
    <main
      data-testid="leaderboard-page"
      className="relative min-h-[100dvh] overflow-hidden bg-[#f6f2ec] px-4 py-8 text-vc-ink sm:px-8 sm:py-16"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(79,65,45,0.06)_0.7px,transparent_0.7px)] [background-size:10px_10px]"
        aria-hidden
      />
      <section className="relative mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-[980px] rounded-[28px] border border-vc-line-warm bg-[#fffdf8]/98 px-[clamp(1.5rem,6vw,5.8rem)] py-[clamp(2rem,6vw,5.4rem)] vc-shadow-modal sm:rounded-[36px]">
        <header className="flex items-start justify-between gap-4">
          <h1 className="vc-reading-serif text-[clamp(2.7rem,12vw,5.4rem)] font-semibold leading-none text-vc-ink-deep">
            排行榜
          </h1>
          <button
            type="button"
            data-testid="leaderboard-close"
            onClick={() => router.push("/")}
            className="vc-reading-serif mt-1 shrink-0 rounded-full border border-vc-line bg-vc-paper-bright px-5 py-2 text-[1.1rem] font-semibold text-vc-ink vc-shadow-card transition hover:bg-white hover:border-vc-accent/40 active:scale-95 sm:px-8 sm:text-[1.3rem]"
          >
            关闭
          </button>
        </header>

        <div className="mt-[clamp(2.2rem,7vw,4.5rem)] space-y-4">
          <LeaderboardList
            currentUserId={currentUserId}
            initialData={initialData ?? null}
            initialDegraded={initialDegraded}
            initialReason={initialReason}
          />
        </div>
      </section>
    </main>
  );
}