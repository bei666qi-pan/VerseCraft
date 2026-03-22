"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Lightbulb } from "lucide-react";
import { fetchCloudSaves } from "@/app/actions/save";
import { signInOrRegister } from "@/app/actions/auth";
import { submitFeedback } from "@/app/actions/feedback";
import Leaderboard from "@/components/Leaderboard";
import { GlassCtaButton } from "@/components/GlassCtaButton";
import { GlassEntryFrame } from "@/components/GlassEntryFrame";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { useGameStore, type SaveSlotData } from "@/store/useGameStore";
import { unlockBgmOnUserGesture } from "@/config/audio";

type HomeClientProps = {
  initialUser: { id: string; name: string } | null;
};

type SaveRow = {
  slotId: string;
  data: Record<string, unknown>;
  updatedAt: string | null;
};

const INITIAL_AUTH_ACTION_STATE = { success: false, message: "", error: "" };

function isSaveSlotData(data: unknown): data is SaveSlotData {
  const d = data as Record<string, unknown> | null;
  return (
    typeof d === "object" &&
    d !== null &&
    typeof d.historicalMaxSanity === "number" &&
    typeof d.time === "object" &&
    Array.isArray(d.inventory) &&
    Array.isArray(d.logs)
  );
}

export default function HomeClient({ initialUser }: HomeClientProps) {
  const router = useRouter();
  const user = initialUser;

  const setUser = useGameStore((s) => s.setUser);
  const guestId = useGameStore((s) => s.guestId ?? "guest_home");
  const saveSlots = useGameStore((s) => s.saveSlots ?? {});
  const resetForNewGame = useGameStore((s) => s.resetForNewGame);
  const hydrateFromCloud = useGameStore((s) => s.hydrateFromCloud);

  const [authOpen, setAuthOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [authWarn, setAuthWarn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cloudRows, setCloudRows] = useState<SaveRow[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [authState, authFormAction, authPending] = useActionState(signInOrRegister, INITIAL_AUTH_ACTION_STATE);

  const hasLocalAutoSave = useMemo(() => Boolean(saveSlots.auto_save), [saveSlots]);
  const hasCloudAutoSave = useMemo(
    () => cloudRows.some((row) => row.slotId === "auto_save"),
    [cloudRows]
  );

  useEffect(() => {
    setUser(user ? { name: user.name } : null);
  }, [setUser, user]);

  useHeartbeat(!!user, guestId, "/");

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

  function closeAuthModal() {
    setAuthOpen(false);
    setIsConnecting(false);
  }

  async function handleLogout() {
    await signOut({ redirect: false });
    setUser(null);
    setCloudRows([]);
    router.refresh();
  }

  async function handleContinueAdventure() {
    unlockBgmOnUserGesture();
    const rows = await fetchCloudSaves().catch(() => []);
    const auto = (rows as SaveRow[]).find((r) => r.slotId === "auto_save");
    if (auto && isSaveSlotData(auto.data)) {
      hydrateFromCloud("auto_save", auto.data);
    }
    router.push("/play");
  }

  async function handleFeedbackSubmit() {
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
          className="pointer-events-none absolute -z-10 top-[-8%] left-[10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.9_0.06_195/0.4)_0%,transparent_70%)]"
          style={{ animation: "haloFloat 14s ease-in-out infinite" }}
        />
        <div
          className="pointer-events-none absolute -z-10 bottom-[-6%] right-[8%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.88_0.08_320/0.35)_0%,transparent_70%)]"
          style={{ animation: "haloFloat 18s ease-in-out infinite reverse" }}
        />
        <div
          className="pointer-events-none absolute -z-10 top-[35%] left-[50%] h-[350px] w-[350px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.92_0.04_270/0.4)_0%,transparent_70%)]"
          style={{ animation: "haloFloat 22s ease-in-out infinite 4s" }}
        />

        <div className="fixed right-4 top-4 sm:right-8 sm:top-8 z-50" style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}>
          {!user ? (
            <button type="button" onClick={openAuthModal} aria-label="执笔登入账户">
              <div
                className={`group relative flex items-center gap-2.5 rounded-full border border-white/10 bg-slate-900/40 px-4 py-2 backdrop-blur-2xl shadow-[0_0_34px_rgba(15,23,42,0.7)] transition-all duration-500 hover:scale-105 hover:border-cyan-300/60 hover:shadow-[0_0_45px_rgba(56,189,248,0.75)] active:scale-95 ${
                  authWarn ? "ring-2 ring-red-500/80 animate-pulse" : ""
                }`}
              >
                <div className="relative flex h-10 w-10 items-center justify-center">
                  <div className="absolute -inset-1 rounded-full bg-slate-300/45 blur-md animate-pulse" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-r-slate-300 border-t-slate-200 animate-[spin_1.2s_linear_infinite] drop-shadow-[0_0_18px_rgba(148,163,184,0.95)]" />
                  <div className="absolute inset-[3px] rounded-full bg-slate-900/90 backdrop-blur-sm border border-white/15" />
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
                    <Image
                      src="/logo.svg"
                      alt="VerseCraft"
                      width={32}
                      height={32}
                      className="object-cover scale-[1.12]"
                    />
                  </div>
                </div>
                <span
                  className={`pr-1 text-xs font-semibold tracking-[0.28em] text-slate-100 uppercase ${
                    isConnecting ? "opacity-80" : ""
                  }`}
                >
                  执笔登入
                </span>
              </div>
            </button>
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

        {authOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={closeAuthModal}
            />
            <div className="relative w-full max-w-md rounded-3xl border border-white/20 bg-slate-900/85 px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.9)] backdrop-blur-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold tracking-widest text-slate-100">执笔登入</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    新笔名将自动建档；已有笔名请输入密码。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAuthModal}
                  className="shrink-0 rounded-full border border-slate-600/60 bg-slate-800/80 px-3 py-1 text-xs text-slate-300 hover:border-slate-400 hover:text-slate-100"
                >
                  关闭
                </button>
              </div>

              <form key="auth-unified-form" className="relative mt-5 space-y-3" action={authFormAction}>
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
                  autoComplete="username"
                  placeholder="笔名（至少 2 字）"
                  className="h-10 w-full rounded-xl border border-white/25 bg-slate-900/40 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="密码（至少 6 位）"
                  className="h-10 w-full rounded-xl border border-white/25 bg-slate-900/40 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={authPending}
                  className={`h-10 w-full rounded-xl bg-slate-100 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 ${
                    authPending ? "halo-nerve" : ""
                  }`}
                >
                  {authPending ? "处理中..." : "进入文界"}
                </button>
                {!authState.success && authState.error && (
                  <div className="mt-3 rounded-xl border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs text-red-100">
                    {authState.error}
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

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
            <GlassEntryFrame variant="pill">
              <GlassCtaButton
                variant="pill"
                label="继续冒险"
                trailing="→"
                onClick={() => void handleContinueAdventure()}
              />
            </GlassEntryFrame>
          )}

          <GlassEntryFrame variant="pill">
            <GlassCtaButton
              variant="pill"
              label="执笔书写"
              trailing="→"
              onClick={() => {
                unlockBgmOnUserGesture();
                resetForNewGame();
                router.push("/intro");
              }}
            />
          </GlassEntryFrame>
        </div>
        <div className="flex flex-col items-center gap-2 text-sm text-slate-400/80 mt-8">
          <p>欢迎第一批内测用户加入QQ群 <span className="font-mono text-slate-300">377493954</span> 交流</p>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200/60 to-transparent" />

      <div className="fixed bottom-8 left-1/2 z-[90] flex h-14 -translate-x-1/2 items-center text-xs tracking-widest text-slate-500/80">
        <span>【1.1先行版】</span>
      </div>

      <button
        type="button"
        className="fixed bottom-8 right-8 z-[90]"
        onClick={() => {
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
