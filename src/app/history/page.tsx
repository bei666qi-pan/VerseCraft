"use client";

import Link from "next/link";

export default function HistoryPage() {
  return (
    <main className="min-h-[100dvh] bg-slate-50 text-slate-800">
      <div className="mx-auto flex min-h-[100dvh] max-w-2xl items-center px-5 py-12 sm:px-8">
        <section className="w-full rounded-2xl border border-slate-200/90 bg-white px-6 py-10 text-center shadow-sm sm:px-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">VerseCraft</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">页面已下线</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            “书写履历”入口已在本次版本中全局移除，请返回首页继续游戏或查看排行榜。
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
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
              查看排行榜
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
