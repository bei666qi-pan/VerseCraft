"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";

export default function Home() {
  const router = useRouter();
  const isHydrated = useGameStore((s) => s.isHydrated);
  const setHydrated = useGameStore((s) => s.setHydrated);
  const isGameStarted = useGameStore((s) => s.isGameStarted ?? false);
  const resetForNewGame = useGameStore((s) => s.resetForNewGame);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void Promise.resolve(useGameStore.persist.rehydrate()).then(() => {
      setHydrated(true);
    });
  }, [mounted, setHydrated]);

  if (!mounted || !isHydrated) {
    return <main className="min-h-screen bg-slate-950" />;
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-slate-950 text-white">
      {/* SVG liquid refraction filter */}
      <svg className="absolute h-0 w-0" aria-hidden>
        <filter id="liquid-refraction">
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="3" seed="2" />
          <feDisplacementMap in="SourceGraphic" scale="6" />
        </filter>
      </svg>

      {/* Ambient glow orbs */}
      <div
        className="pointer-events-none absolute -z-10 top-[-10%] left-[15%] h-[500px] w-[500px] rounded-full bg-cyan-500/15 blur-[180px]"
        style={{ animation: "ambientDrift 12s ease-in-out infinite" }}
      />
      <div
        className="pointer-events-none absolute -z-10 bottom-[-5%] right-[10%] h-[450px] w-[450px] rounded-full bg-purple-600/15 blur-[160px]"
        style={{ animation: "ambientDrift 15s ease-in-out infinite reverse" }}
      />
      <div
        className="pointer-events-none absolute -z-10 top-[40%] left-[50%] h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[140px]"
        style={{ animation: "ambientDrift 18s ease-in-out infinite 3s" }}
      />

      {/* Noise texture overlay */}
      <div className="pointer-events-none absolute inset-0 -z-5 opacity-[0.03] mix-blend-overlay bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC43NSIgbnVtT2N0YXZlcz0iNCIgc3RpdGNoVGlsZXM9InN0aXRjaCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNuKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />

      {/* Main content */}
      <div className="z-10 flex flex-col items-center px-6 text-center animate-[fadeIn_1s_ease-out]">
        {/* Title */}
        <h1 className="text-5xl font-black tracking-tighter drop-shadow-[0_0_30px_rgba(99,102,241,0.3)] md:text-8xl">
          <span className="bg-gradient-to-b from-white via-white/90 to-white/50 bg-clip-text text-transparent">
            用每一句文字
          </span>
          <br />
          <span className="bg-gradient-to-r from-cyan-300 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            锻造你的分支世界
          </span>
        </h1>

        <p className="mt-8 max-w-md text-sm font-medium uppercase tracking-[0.25em] text-slate-400 md:text-base">
          规则怪谈 · 沉浸式文字冒险 · 大模型驱动
        </p>

        {/* Divider line */}
        <div className="mt-12 h-px w-32 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Action buttons */}
        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          {isGameStarted ? (
            <>
              {/* Continue */}
              <button
                type="button"
                onClick={() => router.push("/play")}
                className="group relative flex items-center gap-3 rounded-full bg-white/5 px-10 py-4 font-bold tracking-widest text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] backdrop-blur-xl border border-white/10 transition-all duration-500 hover:bg-white/10 hover:border-white/20 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]"
              >
                <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" />
                <span className="relative">继续探索</span>
                <span className="relative text-white/40 transition-transform duration-300 group-hover:translate-x-1">→</span>
              </button>

              {/* New Game */}
              <button
                type="button"
                onClick={() => {
                  resetForNewGame();
                  router.push("/intro");
                }}
                className="group relative flex items-center gap-3 rounded-full bg-white/[0.02] px-10 py-4 font-medium tracking-widest text-slate-400 backdrop-blur-md border border-white/5 transition-all duration-500 hover:bg-white/5 hover:border-white/10 hover:text-slate-200"
              >
                <span className="relative">开启新轮回</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/intro")}
              className="group relative flex items-center gap-3 rounded-full bg-white/5 px-12 py-5 font-bold tracking-widest text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] backdrop-blur-xl border border-white/10 transition-all duration-500 hover:bg-white/10 hover:border-white/20 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]"
            >
              <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-500/20 to-purple-500/20 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" />
              <span className="relative">踏入深渊</span>
              <span className="relative text-white/40 transition-transform duration-300 group-hover:translate-x-1">→</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom ambient bar */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </main>
  );
}
