"use client";

import "altcha";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { Lightbulb } from "lucide-react";
import { fetchCloudSaves } from "@/app/actions/save";
import { loginUser, registerUser } from "@/app/actions/auth";
import { submitFeedback } from "@/app/actions/feedback";
import Leaderboard from "@/components/Leaderboard";
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [authWarn, setAuthWarn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cloudRows, setCloudRows] = useState<SaveRow[]>([]);
  const [registerName, setRegisterName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerAutoLoginPending, setRegisterAutoLoginPending] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

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

  useEffect(() => {
    if (!feedbackSuccess || !feedbackOpen) return;
    const t = window.setTimeout(() => {
      setFeedbackOpen(false);
      setFeedbackSuccess(false);
      setFeedbackContent("");
    }, 3000);
    return () => window.clearTimeout(t);
  }, [feedbackOpen, feedbackSuccess]);

  useEffect(() => {
    if (!registerState.success) return;
    if (registerAutoLoginPending) return;
    const name = registerName.trim();
    if (!name || !registerPassword) return;

    let active = true;
    const run = async () => {
      setRegisterAutoLoginPending(true);
      const result = await signIn("credentials", {
        name,
        password: registerPassword,
        redirect: false,
      });
      if (!active) return;
      setRegisterAutoLoginPending(false);
      if (result?.error) {
        setToast("注册成功，但系统接入失败，请手动登录。");
        return;
      }
      setAuthOpen(false);
      setMode("login");
      setRegisterName("");
      setRegisterPassword("");
      router.refresh();
    };

    void run();
    return () => {
      active = false;
    };
  }, [registerAutoLoginPending, registerName, registerPassword, registerState.success, router]);

  function requireLoginOrWarn(): boolean {
    if (user) return true;
    setAuthWarn(true);
    setAuthOpen(true);
    setToast("深渊拒绝了无名之辈。请先完成登录。");
    return false;
  }

  function openAuthModal() {
    setAuthOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsConnecting(true);
      } else {
        setIsConnecting(false);
      }
      return next;
    });
  }

  useEffect(() => {
    if (!isConnecting) return;
    const timer = window.setTimeout(() => setIsConnecting(false), 1200);
    return () => window.clearTimeout(timer);
  }, [isConnecting]);

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

  async function handleFeedbackSubmit() {
    if (!user) return;
    if (!feedbackContent.trim()) {
      setToast("请先输入你的意见。");
      return;
    }

    setFeedbackPending(true);
    const result = await submitFeedback(feedbackContent);
    setFeedbackPending(false);
    if (!result.success) {
      setToast(result.message);
      return;
    }
    setFeedbackSuccess(true);
    setFeedbackContent("");
  }

  return (
    <>
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

        <div className="fixed right-4 top-4 sm:right-8 sm:top-8 z-50" style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}>
        {!user ? (
          <div className="relative group">
            <div
              className={`pointer-events-none absolute -inset-1.5 rounded-full blur-md transition-all duration-700 ${
                isConnecting
                  ? "bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 opacity-100 animate-pulse scale-110"
                  : "bg-white/30 opacity-70 group-hover:opacity-100 group-hover:bg-white/50"
              }`}
            />
            <button
              type="button"
              onClick={openAuthModal}
              className={`relative flex items-center justify-center overflow-hidden rounded-full border border-white/20 bg-black/50 px-12 py-4 backdrop-blur-3xl transition-all duration-500 hover:scale-105 hover:border-cyan-300/60 hover:shadow-[0_0_35px_rgba(6,182,212,0.55)] active:scale-95 ${
                authWarn ? "animate-bounce ring-2 ring-red-500" : ""
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-active:animate-[shimmer_0.5s_ease-out]" />
              <span
                className={`relative z-10 text-xl font-black uppercase tracking-[0.3em] ${
                  isConnecting
                    ? "bg-gradient-to-r from-white via-cyan-100 to-indigo-200 bg-clip-text text-transparent drop-shadow-[0_0_16px_rgba(56,189,248,0.6)]"
                    : "text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]"
                }`}
              >
                建立档案 / 系统接入
              </span>
            </button>

            {authOpen && (
              <div className="liquid-glass-strong absolute right-0 mt-3 w-80 rounded-2xl p-4">
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
                  <form key="login-form" className="relative space-y-3" action={loginAction}>
                    <input
                      name="fax_number"
                      type="text"
                      autoComplete="off"
                      aria-hidden={true}
                      tabIndex={-1}
                      className="absolute left-[-9999px] top-[-9999px] z-[-1] opacity-0"
                    />
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
                    <altcha-widget
                      challengeurl="/api/altcha/challenge"
                      auto="onsubmit"
                      style={{ display: "none" }}
                    />
                    <button
                      type="submit"
                      disabled={loginPending}
                      className={`h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 ${
                        loginPending ? "halo-nerve" : ""
                      }`}
                    >
                      {loginPending ? "正在连接深渊..." : "登录"}
                    </button>
                    {!loginState.success && loginState.error && (
                      <div className="liquid-glass mt-4 flex gap-3 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3">
                        <div className="h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                        <span className="text-sm font-medium tracking-widest text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]">
                          {loginState.error}
                        </span>
                      </div>
                    )}
                  </form>
                ) : (
                  <form key="register-form" className="relative space-y-3" action={registerAction}>
                    <input
                      name="fax_number"
                      type="text"
                      autoComplete="off"
                      aria-hidden={true}
                      tabIndex={-1}
                      className="absolute left-[-9999px] top-[-9999px] z-[-1] opacity-0"
                    />
                    <input
                      name="name"
                      placeholder="账号（至少2位）"
                      className="h-10 w-full rounded-xl border border-white/40 bg-white/60 px-3 text-sm outline-none"
                      value={registerName}
                      onChange={(event) => setRegisterName(event.target.value)}
                    />
                    <input
                      name="password"
                      type="password"
                      placeholder="密码（至少6位）"
                      className="h-10 w-full rounded-xl border border-white/40 bg-white/60 px-3 text-sm outline-none"
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                    />
                    <altcha-widget
                      challengeurl="/api/altcha/challenge"
                      auto="onsubmit"
                      style={{ display: "none" }}
                    />
                    <button
                      type="submit"
                      disabled={registerPending || registerAutoLoginPending}
                      className={`h-10 w-full rounded-xl bg-cyan-700 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60 ${
                        registerPending || registerAutoLoginPending ? "halo-nerve" : ""
                      }`}
                    >
                      {registerPending || registerAutoLoginPending ? "正在连接深渊..." : "注册"}
                    </button>
                    {(registerState.message || registerState.error) && (
                      registerState.success ? (
                        <p className="text-xs text-emerald-700">{registerState.message}</p>
                      ) : (
                        <div className="liquid-glass mt-4 flex gap-3 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3">
                          <div className="h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
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
        <div className="flex flex-col items-center gap-2 text-sm text-slate-400/80 mt-8">
          <p>欢迎第一批内测玩家加入QQ群 <span className="font-mono text-slate-300">377493954</span> 交流</p>
          <p className="tracking-widest opacity-70">【1.1先行版】</p>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200/60 to-transparent" />

      <button
        type="button"
        className="fixed bottom-8 right-8 z-[90]"
        onClick={() => {
          if (!user) {
            requireLoginOrWarn();
            return;
          }
          setFeedbackOpen(true);
          setFeedbackSuccess(false);
        }}
        aria-label="打开意见采集"
      >
        <div className="group relative flex h-14 w-14 cursor-pointer items-center justify-center">
          <div className="absolute -inset-1 rounded-full bg-slate-300/45 blur-md animate-pulse" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-r-slate-300 border-t-slate-400 animate-[spin_1.2s_linear_infinite] drop-shadow-[0_0_14px_rgba(148,163,184,0.95)]" />
          <div className="absolute inset-1 rounded-full bg-white/85 backdrop-blur-sm transition-all group-hover:bg-white" />
          <Lightbulb className="relative z-10 text-slate-700 drop-shadow-[0_0_6px_rgba(71,85,105,0.55)]" size={24} />
        </div>
      </button>

      <div
        className={`fixed inset-0 z-[80] flex items-center justify-center p-6 transition-all duration-500 ${
          feedbackOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className={`absolute inset-0 bg-slate-200/50 backdrop-blur-sm transition-all duration-500 ${
            feedbackOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => {
            if (feedbackPending) return;
            setFeedbackOpen(false);
            setFeedbackSuccess(false);
          }}
        />
        <div
          className={`relative w-full max-w-2xl rounded-[2rem] border border-white bg-slate-100/90 p-10 shadow-[0_0_40px_rgba(200,200,200,0.5)] backdrop-blur-3xl transition-all duration-500 ${
            feedbackOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <h3 className="text-2xl font-semibold tracking-wide text-slate-700">意见采集</h3>
          {!feedbackSuccess ? (
            <>
              <p className="mt-3 text-sm text-slate-500">把你的建议告诉我们，我们会认真阅读每一条反馈。</p>
              <textarea
                value={feedbackContent}
                onChange={(event) => setFeedbackContent(event.target.value)}
                placeholder="请输入你的建议或反馈..."
                className="mt-6 h-56 w-full resize-none rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-700 outline-none transition-all focus:border-slate-400 focus:shadow-[0_0_0_4px_rgba(148,163,184,0.15)]"
              />
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  disabled={feedbackPending}
                  onClick={() => void handleFeedbackSubmit()}
                  className="rounded-full bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {feedbackPending ? "提交中..." : "提交意见"}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-8 flex min-h-44 items-center justify-center">
              <p className="text-center text-xl font-medium text-slate-700">谢谢您的意见，游戏会因您变得更好！</p>
            </div>
          )}
        </div>
      </div>
    </main>

    <Leaderboard userId={user?.id} />
    </>
  );
}
