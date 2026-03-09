"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { fetchCloudSaves } from "@/app/actions/save";
import { loginUser, registerUser } from "@/app/actions/auth";
import { useGameStore, type SaveSlotData } from "@/store/useGameStore";

type HomeClientProps = {
  initialUser: { id: string; name: string } | null;
};

type SaveRow = {
  slotId: string;
  data: Record<string, unknown>;
  updatedAt: string | null;
};

const INITIAL_AUTH_ACTION_STATE = { success: false, message: "", error: "" };

function isSaveSlotData(data: Record<string, unknown>): data is SaveSlotData {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof data.historicalMaxSanity === "number" &&
    typeof data.time === "object" &&
    Array.isArray(data.inventory) &&
    Array.isArray(data.logs)
  );
}

export default function HomeClient({ initialUser }: HomeClientProps) {
  const router = useRouter();
  const user = initialUser;

  const setUser = useGameStore((s) => s.setUser);
  const saveSlots = useGameStore((s) => s.saveSlots ?? {});
  const resetForNewGame = useGameStore((s) => s.resetForNewGame);
  const hydrateFromCloud = useGameStore((s) => s.hydrateFromCloud);

  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [authWarn, setAuthWarn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cloudRows, setCloudRows] = useState<SaveRow[]>([]);

  const [loginState, loginAction, loginPending] = useActionState(loginUser, INITIAL_AUTH_ACTION_STATE);

  const [registerState, registerAction, registerPending] = useActionState(
    registerUser,
    INITIAL_AUTH_ACTION_STATE
  );

  const hasLocalAutoSave = useMemo(() => Boolean(saveSlots.auto_save), [saveSlots]);
  const hasCloudAutoSave = useMemo(
    () => cloudRows.some((row) => row.slotId === "auto_save"),
    [cloudRows]
  );

  useEffect(() => {
    setUser(user ? { name: user.name } : null);
  }, [setUser, user]);

  useEffect(() => {
    if (!user) return;
    void fetchCloudSaves()
      .then((rows) => setCloudRows(rows as SaveRow[]))
      .catch(() => setCloudRows([]));
  }, [user]);

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
    setAuthOpen(true);
    setToast("深渊拒绝了无名之辈。请先完成登录。");
    return false;
  }

  function openAuthModal() {
    setAuthOpen((v) => !v);
  }

  async function handleLogout() {
    await signOut({ redirect: false });
    setUser(null);
    setCloudRows([]);
    router.refresh();
  }

  async function handleContinueAdventure() {
    if (!requireLoginOrWarn()) return;

    const rows = await fetchCloudSaves().catch(() => []);
    const auto = (rows as SaveRow[]).find((r) => r.slotId === "auto_save");
    if (auto && isSaveSlotData(auto.data)) {
      hydrateFromCloud("auto_save", auto.data);
    }
    router.push("/play");
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#f8fafc]">
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
          <div className="relative group">
            <button
              type="button"
              onClick={openAuthModal}
              className={`relative overflow-hidden rounded-full border px-6 py-2 font-medium tracking-widest transition-all duration-500 text-slate-400 bg-slate-900/30 border-white/5 backdrop-blur-sm hover:text-white hover:bg-slate-800/80 hover:border-indigo-400/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] hover:-translate-y-0.5 active:scale-95 active:shadow-[0_0_50px_rgba(168,85,247,0.9)] active:border-purple-400 group ${
                authWarn ? "animate-bounce ring-2 ring-red-500" : ""
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-active:animate-[shimmer_0.5s_ease-out]" />
              <span className="relative z-10">接入档案</span>
            </button>

            {authOpen && (
              <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-white/30 bg-white/20 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
                <div className="mb-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`rounded-full px-3 py-1 text-xs transition ${mode === "login" ? "bg-slate-900 text-white" : "bg-white/40 text-slate-600"}`}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className={`rounded-full px-3 py-1 text-xs transition ${mode === "register" ? "bg-slate-900 text-white" : "bg-white/40 text-slate-600"}`}
                  >
                    注册
                  </button>
                </div>

                {mode === "login" ? (
                  <form className="space-y-3" action={loginAction}>
                    <input
                      name="name"
                      placeholder="账号"
                      className="h-10 w-full rounded-xl border border-white/40 bg-white/60 px-3 text-sm outline-none"
                    />
                    <input
                      name="password"
                      type="password"
                      placeholder="密码"
                      className="h-10 w-full rounded-xl border border-white/40 bg-white/60 px-3 text-sm outline-none"
                    />
                    <button
                      type="submit"
                      disabled={loginPending}
                      className={`h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 ${
                        loginPending ? "animate-pulse" : ""
                      }`}
                    >
                      {loginPending ? "正在连接深渊..." : "登录"}
                    </button>
                    {!loginState.success && loginState.error && (
                      <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-500/50 bg-red-950/50 px-4 py-3 animate-[pulse_2s_ease-in-out_infinite]">
                        <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]" />
                        <span className="text-sm font-medium tracking-widest text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">
                          {loginState.error}
                        </span>
                      </div>
                    )}
                  </form>
                ) : (
                  <form className="space-y-3" action={registerAction}>
                    <input
                      name="name"
                      placeholder="账号（至少2位）"
                      className="h-10 w-full rounded-xl border border-white/40 bg-white/60 px-3 text-sm outline-none"
                    />
                    <input
                      name="password"
                      type="password"
                      placeholder="密码（至少6位）"
                      className="h-10 w-full rounded-xl border border-white/40 bg-white/60 px-3 text-sm outline-none"
                    />
                    <button
                      type="submit"
                      disabled={registerPending}
                      className={`h-10 w-full rounded-xl bg-cyan-700 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60 ${
                        registerPending ? "animate-pulse" : ""
                      }`}
                    >
                      {registerPending ? "正在连接深渊..." : "注册"}
                    </button>
                    {(registerState.message || registerState.error) && (
                      registerState.success ? (
                        <p className="text-xs text-emerald-700">{registerState.message}</p>
                      ) : (
                        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-500/50 bg-red-950/50 px-4 py-3 animate-[pulse_2s_ease-in-out_infinite]">
                          <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]" />
                          <span className="text-sm font-medium tracking-widest text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">
                            {registerState.error}
                          </span>
                        </div>
                      )
                    )}
                  </form>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 animate-[fadeIn_1s_ease-out]">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse drop-shadow-[0_0_8px_rgba(74,222,128,1)]" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-500 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] font-black tracking-widest text-lg">
              {user.name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
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

      <div className="z-10 flex flex-col items-center px-6 text-center animate-[fadeIn_0.8s_ease-out]">
        <h1 className="text-5xl font-bold tracking-widest text-slate-800 drop-shadow-sm md:text-7xl">文界工坊</h1>
        <p className="mt-3 text-xs font-medium tracking-[0.5em] text-slate-400/80 md:text-sm">VERSECRAFT</p>
        <div className="mt-10 h-px w-24 bg-gradient-to-r from-transparent via-slate-300/60 to-transparent" />
        <p className="mt-10 text-sm font-medium tracking-widest text-slate-500 md:text-base">锻造可能，实现梦想</p>

        <div className="mt-14 flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
          {user && (hasLocalAutoSave || hasCloudAutoSave) && (
            <button
              type="button"
              onClick={() => void handleContinueAdventure()}
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

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200/60 to-transparent" />
    </main>
  );
}
