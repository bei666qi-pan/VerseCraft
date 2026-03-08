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
    return <main className="min-h-screen bg-[#f8fafc]" />;
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#f8fafc]">
      {/* Ethereal halo orbs */}
      <div
        className="pointer-events-none absolute -z-10 top-[-8%] left-[10%] h-[520px] w-[520px] rounded-full bg-cyan-200/40 blur-[120px]"
        style={{ animation: "haloFloat 14s ease-in-out infinite" }}
      />
      <div
        className="pointer-events-none absolute -z-10 bottom-[-6%] right-[8%] h-[480px] w-[480px] rounded-full bg-fuchsia-200/40 blur-[120px]"
        style={{ animation: "haloFloat 18s ease-in-out infinite reverse" }}
      />
      <div
        className="pointer-events-none absolute -z-10 top-[35%] left-[50%] h-[350px] w-[350px] -translate-x-1/2 rounded-full bg-indigo-100/50 blur-[100px]"
        style={{ animation: "haloFloat 22s ease-in-out infinite 4s" }}
      />

      {/* Content */}
      <div className="z-10 flex flex-col items-center px-6 text-center animate-[fadeIn_0.8s_ease-out]">
        {/* Main title: Chinese */}
        <h1 className="text-5xl font-bold tracking-widest text-slate-800 drop-shadow-sm md:text-7xl">
          文界工坊
        </h1>

        {/* Main title: English */}
        <p className="mt-3 text-xs font-medium tracking-[0.5em] text-slate-400/80 md:text-sm">
          VERSECRAFT
        </p>

        {/* Subtle divider */}
        <div className="mt-10 h-px w-24 bg-gradient-to-r from-transparent via-slate-300/60 to-transparent" />

        {/* Subtitle */}
        <p className="mt-10 text-sm font-medium tracking-widest text-slate-500 md:text-base">
          锻造可能，实现梦想
        </p>

        {/* Buttons */}
        <div className="mt-14 flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
          {isGameStarted ? (
            <>
              <button
                type="button"
                onClick={() => router.push("/play")}
                className="group relative flex items-center gap-3 rounded-full bg-white/40 px-10 py-4 font-bold tracking-widest text-slate-800 shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 transition-all duration-500 hover:bg-white/60 hover:scale-105 hover:shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_12px_40px_rgba(0,0,0,0.06)]"
              >
                <span className="relative">继续冒险</span>
                <span className="relative text-slate-400 transition-transform duration-300 group-hover:translate-x-1">→</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  resetForNewGame();
                  router.push("/intro");
                }}
                className="flex items-center gap-3 rounded-full bg-white/20 px-10 py-4 font-medium tracking-widest text-slate-500 backdrop-blur-xl border border-white/40 transition-all duration-500 hover:bg-white/35 hover:text-slate-700 hover:scale-105"
              >
                <span>开启新轮回</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/intro")}
              className="group relative flex items-center gap-3 rounded-full bg-white/40 px-12 py-5 font-bold tracking-widest text-slate-800 shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 transition-all duration-500 hover:bg-white/60 hover:scale-105 hover:shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_12px_40px_rgba(0,0,0,0.06)]"
            >
              <span className="relative">进入世界</span>
              <span className="relative text-slate-400 transition-transform duration-300 group-hover:translate-x-1">→</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom hairline */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200/60 to-transparent" />
    </main>
  );
}
