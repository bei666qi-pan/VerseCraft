"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
          文界工坊
        </h1>
        <p className="text-lg tracking-widest text-foreground/40 sm:text-xl">
          VERSECRAFT
        </p>
        <p className="mt-2 max-w-md text-base leading-relaxed text-foreground/60">
          锻造可能，实现幻想。
        </p>
        <Link
          href="/intro"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3.5 text-sm font-medium text-background transition-all hover:opacity-80 active:scale-[0.97]"
        >
          进入如月公寓
          <span aria-hidden="true">→</span>
        </Link>
      </div>
      <p className="absolute bottom-8 text-xs tracking-wide text-foreground/25">
        A Local Single-Player MVP Game
      </p>
    </main>
  );
}
