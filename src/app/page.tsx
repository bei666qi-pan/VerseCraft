"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";

export default function Home() {
  const router = useRouter();
  const isHydrated = useGameStore((s) => s.isHydrated);
  const setHydrated = useGameStore((s) => s.setHydrated);
  const user = useGameStore((s) => s.user);
  const saveSlots = useGameStore((s) => s.saveSlots ?? {});
  const mockLogin = useGameStore((s) => s.mockLogin);
  const logout = useGameStore((s) => s.logout);
  const resetForNewGame = useGameStore((s) => s.resetForNewGame);
  const [mounted, setMounted] = useState(false);
  const [authWarn, setAuthWarn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hasAutoSave = useMemo(() => Boolean(saveSlots["auto_save"]), [saveSlots]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void Promise.resolve(useGameStore.persist.rehydrate()).then(() => {
      setHydrated(true);
    });
  }, [mounted, setHydrated]);

  useEffect(() => {
    if (!authWarn) return;
    const t = setTimeout(() => setAuthWarn(false), 1200);
    return () => clearTimeout(t);
  }, [authWarn]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function requireLoginOrWarn(): boolean {
    if (user) return true;
    setAuthWarn(true);
    setToast("深渊拒绝了无名之辈。请先完成登录。");
    return false;
  }

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

      <div className="fixed right-8 top-8 z-50">
        {!user ? (
          <button
            type="button"
            onClick={mockLogin}
            className={`rounded-full border px-6 py-2.5 text-sm font-semibold tracking-widest text-slate-100 backdrop-blur-2xl transition-all duration-700 ease-in-out ${
              authWarn
                ? "animate-bounce ring-2 ring-red-500 border-red-400/60 bg-red-500/20 shadow-[0_0_22px_rgba(239,68,68,0.35)]"
                : "border-white/30 bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_8px_30px_rgba(14,116,144,0.15)] hover:bg-white/20"
            }`}
          >
            注册 / 登录
          </button>
        ) : (
          <div className="flex items-center gap-3 animate-[fadeIn_1s_ease-out]">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse drop-shadow-[0_0_8px_rgba(74,222,128,1)]" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-500 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] font-black tracking-widest text-lg">
              {user.name}
            </span>
            <button
              type="button"
              onClick={logout}
              className="ml-4 text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              登出
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed top-24 right-8 z-50 rounded-2xl border border-red-400/50 bg-red-950/65 px-4 py-3 text-sm text-red-100 backdrop-blur-xl shadow-[0_0_24px_rgba(220,38,38,0.3)] animate-[fadeIn_0.35s_ease-out]">
          {toast}
        </div>
      )}

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
          {user && hasAutoSave && (
            <button
              type="button"
              onClick={() => router.push("/play")}
              className="group relative flex items-center gap-3 rounded-full bg-white/40 px-10 py-4 font-bold tracking-widest text-slate-800 shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 transition-all duration-500 hover:bg-white/60 hover:scale-105 hover:shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_12px_40px_rgba(0,0,0,0.06)]"
            >
              <span className="relative">继续冒险</span>
              <span className="relative text-slate-400 transition-transform duration-300 group-hover:translate-x-1">→</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (!requireLoginOrWarn()) return;
              resetForNewGame();
              router.push("/intro");
            }}
            className="group relative flex items-center gap-3 rounded-full bg-white/40 px-12 py-5 font-bold tracking-widest text-slate-800 shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 transition-all duration-500 hover:bg-white/60 hover:scale-105 hover:shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_12px_40px_rgba(0,0,0,0.06)]"
          >
            <span className="relative">进入世界</span>
            <span className="relative text-slate-400 transition-transform duration-300 group-hover:translate-x-1">→</span>
          </button>
        </div>
      </div>

      {/* Bottom hairline */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200/60 to-transparent" />
    </main>
  );
}
