// src/app/settlement/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGameStore } from "@/store/useGameStore";
import { submitGameRecord } from "@/app/actions/leaderboard";
import { enrichSettlementHistoryAiRecap } from "@/app/actions/history";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { deleteCloudSaveSlot, enqueueReviveWorldAdvanceJob } from "@/app/actions/save";
import { useAchievementsStore } from "@/store/useAchievementsStore";
import { GuestSoftNudge } from "@/components/GuestSoftNudge";
import { useMounted } from "@/hooks/useMounted";
import { LOCATION_LABELS } from "@/features/play/render/locationLabels";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { useClientPageDynamicProps } from "@/lib/next/useClientPageDynamicProps";

type LogEntry = { role: string; content: string; reasoning?: string };
type SettlementAiReview = {
  summary: string;
  strengths: string[];
  risks: string[];
  nextActions: string[];
  confidence: { score: number; level: "high" | "medium" | "low"; reason: string };
  evidence: Array<{ metric: string; value: string; source: string }>;
  evidenceSufficiency: "enough" | "insufficient";
  generatedAt: string;
};

function replaceLocationIdsForDisplay(text: string): string {
  let out = String(text ?? "");
  for (const [id, label] of Object.entries(LOCATION_LABELS)) {
    if (!id || !label) continue;
    out = out.replaceAll(id, label);
  }
  return out;
}

export type SettlementGrade = "S" | "A" | "B" | "C" | "D" | "E";

const GRADE_STYLES: Record<SettlementGrade, string> = {
  S: "bg-gradient-to-br from-amber-400 via-yellow-300 to-amber-500 text-transparent bg-clip-text drop-shadow-[0_0_20px_rgba(251,191,36,0.8)] font-black tracking-widest",
  A: "bg-gradient-to-br from-cyan-300 via-teal-200 to-emerald-400 text-transparent bg-clip-text drop-shadow-[0_0_16px_rgba(34,211,238,0.6)] font-extrabold tracking-wider",
  B: "bg-gradient-to-br from-violet-400 to-purple-300 text-transparent bg-clip-text drop-shadow-[0_0_12px_rgba(167,139,250,0.5)] font-bold",
  C: "bg-gradient-to-br from-sky-400 to-blue-300 text-transparent bg-clip-text drop-shadow-[0_0_10px_rgba(56,189,248,0.4)] font-semibold",
  D: "bg-gradient-to-br from-slate-400 to-slate-300 text-transparent bg-clip-text drop-shadow-[0_0_8px_rgba(148,163,184,0.4)] font-medium",
  E: "text-slate-500 drop-shadow-none font-normal",
};

function computeGrade(
  isDead: boolean,
  maxFloor: number,
  kills: number,
  survivalHours: number
): SettlementGrade {
  if (isDead) return "E";
  const escaped = maxFloor >= 99;
  const killAll = kills >= 8;
  if (escaped || killAll) return "S";
  if (maxFloor >= 7 || kills >= 5 || (maxFloor >= 6 && survivalHours >= 48)) return "A";
  if (maxFloor >= 5 || kills >= 3 || (maxFloor >= 4 && kills >= 2)) return "B";
  if (maxFloor >= 3 || kills >= 2) return "C";
  if (maxFloor >= 2 || kills >= 1) return "D";
  return "E";
}

function formatFloorDisplay(score: number): string {
  if (score >= 99) return "地下二层出口";
  if (score <= 0) return "地下一层";
  return `第 ${score} 层`;
}

function generateSettlementReview(
  grade: SettlementGrade,
  isDead: boolean,
  kills: number,
  maxFloor: number
): [string, string] {
  if (grade === "S") {
    if (kills >= 8) {
      return [
        "你竟将公寓的猎食者们屠戮殆尽，连深渊守门人也未能幸免。",
        "这栋楼从未见过如此傲慢的胜利者——你值得被刻在它的残骸上。",
      ];
    }
    return [
      "你找到了出口，从高维肠胃的消化中挣脱。",
      "很少有人能走到这一步；你证明了规则可以被驯服，而非只能被恐惧。",
    ];
  }
  if (grade === "E" && isDead) {
    if (kills > 0) {
      return [
        "你至少证明了自己不是完全的废物——杀过诡异，却在最后倒下了。",
        "可惜，公寓从不记得死人的战绩。",
      ];
    }
    if (maxFloor >= 3) {
      return [
        "你曾抵达过更高的楼层，却最终被恐惧或愚蠢拖回了深渊。",
        "探索的野心若没有生存的智慧支撑，不过是给消化系统添一道开胃菜。",
      ];
    }
    return [
      "连地下一层的洗衣房阿姨都比你活得久。",
      "",
    ];
  }
  if (grade === "A") {
    return [
      "你离真相与出口已近在咫尺，却在最后一刻停下。",
      "令人惋惜的是，公寓不会因「差一点」而放过任何人——但你的表现足以令它记住。",
    ];
  }
  if (grade === "B") {
    return [
      kills > 0
        ? `猎杀 ${kills} 只诡异，抵达第 ${maxFloor} 层——你比多数闯入者更有价值。`
        : `抵达第 ${maxFloor} 层已非易事，但你显然还缺一把能撕开规则缺口的钥匙。`,
      "继续往上爬，或在此止步；公寓从不挽留犹豫的人。",
    ];
  }
  if (grade === "C") {
    return [
      `第 ${maxFloor} 层，${kills} 只诡异的战绩——中规中矩，既不耀眼也不可耻。`,
      "你证明了你能活，却还没证明你能赢。",
    ];
  }
  if (grade === "D") {
    return [
      "你至少走出了地下一层，也至少摸到了诡异的衣角。",
      "对于这栋楼而言，你仍是饲料；但对于那些从未上过楼的人而言，你已是传说。",
    ];
  }
  return [
    "你的存在为公寓增添了一点微不足道的熵。",
    "下次，试着多活一会儿，或者多杀几只。",
  ];
}

function buildMarkdown(logs: LogEntry[]): string {
  const lines: string[] = [
    "# 文界工坊 · 写作记录",
    "",
    "---",
    "",
  ];

  for (const entry of logs) {
    if (entry.role === "user") {
      lines.push("## 用户动作");
      lines.push("");
      lines.push(replaceLocationIdsForDisplay(entry.content));
      lines.push("");
      lines.push("---");
      lines.push("");
    } else if (entry.role === "assistant") {
      lines.push("## DM 叙事");
      lines.push("");
      lines.push(replaceLocationIdsForDisplay(entry.content));
      lines.push("");

      if (entry.reasoning && entry.reasoning.trim().length > 0) {
        lines.push("<details>");
        lines.push("<summary>推理过程（折叠）</summary>");
        lines.push("");
        lines.push(replaceLocationIdsForDisplay(entry.reasoning));
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    } else if (entry.role === "system") {
      lines.push("## 系统指令");
      lines.push("");
      lines.push("```");
      lines.push(replaceLocationIdsForDisplay(entry.content));
      lines.push("```");
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function resolveFloorScore(location: string): number {
  if (!location) return 0;
  if (location.startsWith("B2_")) return 99;
  if (location.startsWith("B1_")) return 0;
  const match = location.match(/^(\d)F_/);
  if (!match) return 0;
  return Number(match[1] ?? 0);
}

function estimateKilledAnomalies(logs: LogEntry[]): number {
  const text = logs
    .filter((item) => item.role === "assistant")
    .map((item) => item.content)
    .join("\n");
  const matches = text.match(/击杀.{0,8}诡异|诡异.{0,8}击杀/g);
  return matches ? Math.max(0, matches.length) : 0;
}

type UploadOutcome = {
  cloudOk: boolean;
  historyId: number | null;
  onLeaderboard: boolean;
};

export default function SettlementPage(props: AppPageDynamicProps) {
  useClientPageDynamicProps(props);
  const mounted = useMounted();
  const [onLeaderboardToast, setOnLeaderboardToast] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const [uploadOutcome, setUploadOutcome] = useState<UploadOutcome | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const hasUploadedRef = useRef(false);
  const hasAchievementPushedRef = useRef(false);
  const lastSettlementHistoryIdRef = useRef<number | null>(null);
  const aiEnrichedHistoryIdRef = useRef<number | null>(null);
  const fitWrapRef = useRef<HTMLDivElement | null>(null);
  const fitCardRef = useRef<HTMLDivElement | null>(null);

  const stats = useGameStore((s) => s.stats) ?? { sanity: 0, agility: 0, luck: 0, charm: 0, background: 0 };
  const logs = useGameStore((s) => s.logs ?? []);
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");
  const historicalMaxFloorScore = useGameStore((s) => s.historicalMaxFloorScore ?? 0);
  const currentSaveSlot = useGameStore((s) => s.currentSaveSlot ?? "main_slot");
  const [aiReview, setAiReview] = useState<SettlementAiReview | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const reviveContext = useGameStore((s) => s.reviveContext);
  const professionState = useGameStore((s) => s.professionState);

  const sanity = stats?.sanity ?? 0;
  const isDead = sanity <= 0;
  const kills = estimateKilledAnomalies(logs);
  const floorFromLocation = resolveFloorScore(playerLocation);
  const maxFloor = Math.max(floorFromLocation, historicalMaxFloorScore);
  const survivalHours = (time.day ?? 0) * 24 + (time.hour ?? 0);
  const grade = computeGrade(isDead, maxFloor, kills, survivalHours);
  const [reviewLine1, reviewLine2] = generateSettlementReview(
    grade,
    isDead,
    kills,
    maxFloor
  );

  const buildAiReviewPayload = useCallback(() => {
    const keyEvents = logs
      .slice(-10)
      .filter((x) => x.role === "user" || x.role === "assistant")
      .map((x) => String(x.content ?? "").trim())
      .filter(Boolean)
      .slice(-6);
    return {
      sessionId: currentSaveSlot,
      player: {
        grade,
        survivalHours,
        maxFloor,
        kills,
        isDead,
      },
      signals: {
        playerLocation,
        keyEvents,
      },
      evidenceQuality: keyEvents.length >= 3 ? "enough" : "insufficient",
    } as const;
  }, [currentSaveSlot, grade, survivalHours, maxFloor, kills, isDead, playerLocation, logs]);

  const handleSubmit = useCallback(async () => {
    if (hasUploadedRef.current) return;
    hasUploadedRef.current = true;
    const survivalTimeSeconds = Math.max(0, survivalHours * 3600);
    const profession = professionState?.currentProfession ?? null;
    const recapSummary = [reviewLine1, reviewLine2].filter(Boolean).join("\n");
    const writingMarkdown = buildMarkdown(logs);
    const res = await submitGameRecord({
      killedAnomalies: kills,
      maxFloorScore: maxFloor,
      survivalTimeSeconds,
      outcome: isDead ? "death" : maxFloor >= 99 ? "victory" : "abandon",
      history: {
        grade,
        survivalDay: time.day ?? 0,
        survivalHour: time.hour ?? 0,
        maxFloorLabel: formatFloorDisplay(maxFloor),
        profession: profession ? String(profession) : null,
        recapSummary,
        isDead,
        hasEscaped: !isDead && maxFloor >= 99,
        writingMarkdown,
      },
    });
    if (typeof res.historyId === "number") {
      lastSettlementHistoryIdRef.current = res.historyId;
    }
    setUploadOutcome({
      cloudOk: !!res.success,
      historyId: typeof res.historyId === "number" ? res.historyId : null,
      onLeaderboard: !!res.onLeaderboard,
    });
    if (res.success && res.onLeaderboard) {
      setOnLeaderboardToast(true);
      window.setTimeout(() => setOnLeaderboardToast(false), 9500);
    }
  }, [
    kills,
    maxFloor,
    survivalHours,
    isDead,
    grade,
    professionState?.currentProfession,
    reviewLine1,
    reviewLine2,
    logs,
    time.day,
    time.hour,
  ]);

  useEffect(() => {
    if (!mounted) return;
    void (async () => {
      await handleSubmit();
    })();
  }, [mounted, handleSubmit]);

  useEffect(() => {
    if (!mounted) return;
    void trackGameplayEvent({
      eventName: "settlement_viewed",
      page: "/settlement",
      source: "settlement",
      payload: {
        isDead,
        grade,
        kills,
        maxFloor,
        survivalHours,
      },
    }).catch(() => {});
  }, [mounted, isDead, grade, kills, maxFloor, survivalHours]);

  useEffect(() => {
    if (!mounted || !isDead) return;
    if (reviveContext?.pending || reviveContext?.deathLocation) return;
    useGameStore.getState().recordDeathForRevive("精神锚点归零");
  }, [mounted, isDead, reviveContext]);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    const sessionId = currentSaveSlot;
    const loadAiReview = async () => {
      setAiReviewLoading(true);
      try {
        const getResp = await fetch(
          `/api/settlement/analysis?sessionId=${encodeURIComponent(sessionId)}`,
          { credentials: "include" }
        );
        if (getResp.ok) {
          const data = (await getResp.json().catch(() => null)) as
            | { output?: SettlementAiReview }
            | null;
          if (!cancelled && data?.output) setAiReview(data.output);
          return;
        }
        const postResp = await fetch("/api/settlement/analysis", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildAiReviewPayload()),
        });
        const postData = (await postResp.json().catch(() => null)) as
          | { output?: SettlementAiReview }
          | null;
        if (!cancelled && postData?.output) setAiReview(postData.output);
      } catch {
        // AI复盘为非阻塞增强，失败时静默保底为规则文案。
      } finally {
        if (!cancelled) setAiReviewLoading(false);
      }
    };
    void loadAiReview();
    return () => {
      cancelled = true;
    };
  }, [mounted, currentSaveSlot, buildAiReviewPayload]);

  useEffect(() => {
    if (!mounted || !aiReview?.summary?.trim()) return;
    const hid = lastSettlementHistoryIdRef.current;
    if (hid == null || aiEnrichedHistoryIdRef.current === hid) return;
    aiEnrichedHistoryIdRef.current = hid;
    void enrichSettlementHistoryAiRecap({ historyId: hid, aiSummary: aiReview.summary });
  }, [mounted, aiReview?.summary]);

  useEffect(() => {
    if (!mounted) return;
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [mounted]);

  useEffect(() => {
    if (!mounted || hasAchievementPushedRef.current) return;
    hasAchievementPushedRef.current = true;
    useAchievementsStore.getState().addRecord({
      survivalTimeText: `${time.day} 日 ${time.hour} 时`,
      grade,
      kills,
      maxFloor,
      maxFloorDisplay: formatFloorDisplay(maxFloor),
      reviewLine1,
      reviewLine2,
    });
  }, [
    mounted,
    grade,
    kills,
    maxFloor,
    reviewLine1,
    reviewLine2,
    time.day,
    time.hour,
  ]);

  useEffect(() => {
    if (!mounted) return;
    const recomputeFitScale = () => {
      const wrap = fitWrapRef.current;
      const card = fitCardRef.current;
      if (!wrap || !card) return;

      const isMobile = window.matchMedia("(max-width: 640px)").matches;
      if (!isMobile) {
        setFitScale(1);
        return;
      }

      // Reset first, then measure natural content height.
      card.style.transform = "scale(1)";
      const viewportHeight = Math.max(1, window.innerHeight || 1);
      const viewportWidth = Math.max(1, window.innerWidth || 1);
      const naturalHeight = Math.max(1, card.scrollHeight);
      const naturalWidth = Math.max(1, card.scrollWidth);
      const availableHeight = Math.max(1, viewportHeight - 12);
      const availableWidth = Math.max(1, viewportWidth - 12);
      const scaleByHeight = availableHeight / naturalHeight;
      const scaleByWidth = availableWidth / naturalWidth;
      const nextScale = Math.min(1, scaleByHeight, scaleByWidth);
      setFitScale(nextScale);
    };

    const raf = window.requestAnimationFrame(recomputeFitScale);
    window.addEventListener("resize", recomputeFitScale);
    window.addEventListener("orientationchange", recomputeFitScale);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", recomputeFitScale);
      window.removeEventListener("orientationchange", recomputeFitScale);
    };
  }, [
    mounted,
    reviewLine1,
    reviewLine2,
    isDead,
    grade,
    sanity,
    kills,
    maxFloor,
    time.day,
    time.hour,
    archiveOpen,
    uploadOutcome,
    aiReview,
  ]);

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="animate-pulse text-neutral-500">结算中...</div>
      </main>
    );
  }

  function handleExport() {
    const md = buildMarkdown(logs);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    void trackGameplayEvent({
      eventName: "settlement_export_clicked",
      page: "/settlement",
      source: "settlement",
      payload: { isDead, grade, maxFloor },
    }).catch(() => {});
    triggerDownload(md, `versecraft-写作记录-${ts}.md`);
  }

  async function handleRestart() {
    void trackGameplayEvent({
      eventName: "settlement_restart_clicked",
      page: "/settlement",
      source: "settlement",
      payload: { isDead, grade, maxFloor },
    }).catch(() => {});
    const slotId = useGameStore.getState().currentSaveSlot || "main_slot";
    useGameStore.getState().chooseReviveOption("restart");
    useGameStore.getState().destroySaveData();
    await deleteCloudSaveSlot(slotId);
    await deleteCloudSaveSlot(slotId === "main_slot" ? "auto_main" : `auto_${slotId}`);
    const p = useGameStore.persist.clearStorage() as unknown;
    if (p && typeof (p as Promise<unknown>).then === "function") {
      await (p as Promise<void>);
    }
    window.location.href = "/";
  }

  async function handleReviveNow() {
    void trackGameplayEvent({
      eventName: "settlement_revive_clicked",
      page: "/settlement",
      source: "settlement",
      payload: { isDead, grade, maxFloor },
    }).catch(() => {});
    useGameStore.getState().chooseReviveOption("revive");
    const st = useGameStore.getState();
    const slotId = st.currentSaveSlot || "main_slot";
    st.saveGame(slotId);
    void enqueueReviveWorldAdvanceJob({
      slotId,
      playerLocation: st.playerLocation ?? "B1_SafeZone",
      turnIndex: (st.time.day ?? 0) * 24 + (st.time.hour ?? 0),
    }).catch(() => undefined);
    window.location.href = "/play";
  }

  const persistLine =
    uploadOutcome == null ? (
      <p className="text-center text-[11px] leading-relaxed text-slate-500">
        正在把你的本局结果写入记录（若已登录则同步账号）…
      </p>
    ) : uploadOutcome.cloudOk && uploadOutcome.historyId != null ? (
      <p className="text-center text-[11px] leading-relaxed text-emerald-200/85">
        <span className="font-semibold text-emerald-100/95">本局已写入你的「书写履历」。</span>
        摘要与写作稿快照已归档，可随时在历史中心回看或再次下载。
      </p>
    ) : uploadOutcome.cloudOk ? (
      <p className="text-center text-[11px] leading-relaxed text-amber-200/80">
        本局成绩已同步至服务器（含排行榜统计）。
        <span className="text-amber-100/90"> 若「书写履历」暂未显示本条，可稍后在历史页刷新。</span>
      </p>
    ) : (
      <p className="text-center text-[11px] leading-relaxed text-slate-400">
        <span className="font-semibold text-slate-300">本局目前仅保存在本机浏览器。</span>
        登录同一笔名后，可把摘要与写作稿同步到云端、跨设备查看；若清除本站数据或更换设备，本机记录有丢失风险。
      </p>
    );

  /** 在确认未写入云端后再提示，避免误伤“登录了但网络失败”的极少数情况下面子过于绝对 */
  const guestLoginHint =
    uploadOutcome !== null && !uploadOutcome.cloudOk ? (
      <p className="rounded-lg border border-slate-600/35 bg-slate-950/40 px-3 py-2 text-center text-[11px] leading-relaxed text-slate-500">
        若希望这一局随账号留下痕迹：回到首页登录同一笔名后再来游玩，此后结算会自动进入「书写履历」，换设备也能回看。
      </p>
    ) : null;

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-foreground">
      <GuestSoftNudge context="settlement" />
      {onLeaderboardToast && (
        <div
          className="fixed inset-x-3 top-6 z-50 mx-auto max-w-lg rounded-2xl border border-cyan-400/40 bg-slate-950/95 px-5 py-4 shadow-[0_0_40px_rgba(34,211,238,0.22)] backdrop-blur-xl sm:inset-x-6"
          role="alert"
        >
          <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300/90">
            探索榜 · 前十
          </p>
          <p className="mt-2 text-center text-sm font-medium leading-relaxed text-cyan-50">
            你已进入或保持在首页「探索榜」前列；这是公开维度里对这一局的额外注脚。
          </p>
          <p className="mt-2 text-center text-xs text-cyan-200/80">
            <Link
              href="/#home-leaderboard"
              className="font-semibold underline decoration-cyan-400/60 underline-offset-4 hover:text-white"
            >
              去首页查看完整榜单
            </Link>
          </p>
        </div>
      )}

      <div ref={fitWrapRef} className="mx-auto flex h-[100dvh] w-full max-w-2xl flex-col items-center justify-center px-1.5 py-1.5 sm:px-6 sm:py-16">
        <div
          ref={fitCardRef}
          className="w-full space-y-3 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-3 shadow-xl backdrop-blur-sm sm:space-y-10 sm:p-10"
          style={{ transform: `scale(${fitScale})`, transformOrigin: "center center" }}
        >
          <header className="text-center">
            <div
              className={`mb-2 text-5xl sm:mb-4 sm:text-6xl ${GRADE_STYLES[grade]}`}
              aria-label={`结算评级：${grade}`}
            >
              {grade}
            </div>
            <h1
              className={`text-2xl font-semibold tracking-tight ${
                isDead ? "text-red-400/90" : "text-slate-200"
              }`}
            >
              {isDead
                ? "精神锚点归零"
                : "你暂时逃离了高维肠胃"}
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              {isDead
                ? ""
                : "你暂时离开了那栋楼，但规则会记住你。"}
            </p>
          </header>

          <div className="space-y-2">
            {persistLine}
            {guestLoginHint}
          </div>

          <section className="rounded-xl border border-slate-600/45 bg-slate-800/35 px-4 py-3 sm:px-5 sm:py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              规则结算 · 定调
            </p>
            <p className="mt-2 text-xs text-slate-500">
              以下内容由本局数值与规则直接生成，用于评级与历史摘要；情绪与氛围以这里为准。
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">{reviewLine1}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{reviewLine2}</p>
          </section>

          <section className="rounded-xl border border-indigo-500/20 bg-slate-800/25 px-4 py-3 sm:px-5 sm:py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300/80">
              叙事补充 · 读后感
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              在规则结算之上，用本局对话片段生成的<strong className="font-medium text-slate-400">可读性总结</strong>
              ，仅供回味与梳理，
              <span className="text-slate-500">不参与评级、也不会替代上文定调。</span>
              生成完成后会自动附在「书写履历」里，方便以后回看。
            </p>
            {aiReviewLoading && !aiReview ? (
              <p className="mt-3 text-sm text-indigo-100/70">正在根据本局文本生成补充总结…</p>
            ) : aiReview?.summary?.trim() ? (
              <div className="mt-3 space-y-2 border-t border-indigo-500/15 pt-3">
                <p className="text-sm leading-relaxed text-slate-200">{aiReview.summary}</p>
                <p className="text-[10px] text-slate-500">
                  模型置信：{aiReview.confidence.level}（{Math.round(aiReview.confidence.score * 100)}%） ·
                  素材充分性：{aiReview.evidenceSufficiency === "enough" ? "较好" : "有限"}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                本局暂未生成可用的补充总结；你仍拥有完整的规则结算与下方的数据归档。
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-3 sm:px-5 sm:py-5">
            <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-600/40 bg-slate-900/50 px-4 py-3">
                <div className="text-xs text-slate-500">存活时间</div>
                <div className="mt-1 text-lg font-semibold text-slate-200">
                  {time.day} 日 {time.hour} 时
                </div>
              </div>
              <div className="rounded-lg border border-slate-600/40 bg-slate-900/50 px-4 py-3">
                <div className="text-xs text-slate-500">精神锚点</div>
                <div
                  className={`mt-1 text-lg font-semibold ${
                    sanity <= 0 ? "text-red-400" : "text-slate-200"
                  }`}
                >
                  {sanity}
                </div>
              </div>
              <div className="rounded-lg border border-slate-600/40 bg-slate-900/50 px-4 py-3">
                <div className="text-xs text-slate-500">消灭诡异</div>
                <div className="mt-1 text-lg font-semibold text-slate-200">{kills} 只</div>
              </div>
              <div className="rounded-lg border border-slate-600/40 bg-slate-900/50 px-4 py-3">
                <div className="text-xs text-slate-500">最高抵达</div>
                <div className="mt-1 text-lg font-semibold text-slate-200">
                  {formatFloorDisplay(maxFloor)}
                </div>
              </div>
            </div>
          </section>

          {archiveOpen ? (
            <section
              id="settlement-archive"
              className="rounded-xl border border-slate-700/50 bg-slate-900/40"
            >
              <div className="space-y-3 px-4 py-3 sm:px-5 sm:py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  本局归档摘要
                </p>
                <ul className="space-y-2 text-xs leading-relaxed text-slate-400">
                  <li>
                    <span className="text-slate-500">评级：</span>
                    <span className="font-semibold text-slate-200">{grade}</span>
                  </li>
                  <li>
                    <span className="text-slate-500">这一局的时间坐标：</span>
                    {time.day} 日 {time.hour} 时（约 {survivalHours} 小时跨度）
                  </li>
                  <li>
                    <span className="text-slate-500">战绩：</span>
                    消灭诡异 {kills} 只 · 最高抵达 {formatFloorDisplay(maxFloor)}
                    {professionState?.currentProfession ? (
                      <> · 职业 {String(professionState.currentProfession)}</>
                    ) : null}
                  </li>
                  <li>
                    <span className="text-slate-500">结局：</span>
                    {isDead ? "死亡封卷" : maxFloor >= 99 ? "逃离" : "暂未以逃离收束"}
                  </li>
                  <li className="text-slate-500">
                    {uploadOutcome?.cloudOk && uploadOutcome.historyId != null
                      ? "以上内容已随本局一并写入「书写履历」，可在历史页下载与本次相同的写作稿快照。"
                      : "以上内容已记入本机成就预览；登录后可同步到历史中心。"}
                  </li>
                </ul>
              </div>
            </section>
          ) : null}

          <div className="flex flex-col gap-3 sm:gap-4">
            {isDead ? (
              <button
                type="button"
                onClick={handleReviveNow}
                className="min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-emerald-300 to-teal-200 px-6 py-3.5 text-base font-bold tracking-wide text-emerald-950 shadow-[0_0_24px_rgba(52,211,153,0.35)] transition hover:from-emerald-200 hover:to-teal-100"
              >
                继续行动：回拨时间复活
                <span className="mt-0.5 block text-center text-[11px] font-medium normal-case tracking-normal text-emerald-950/80">
                  +12h · 物品遗失 · 回到对局
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleRestart()}
                className="min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-slate-100 to-slate-200 px-6 py-3.5 text-base font-bold tracking-wide text-slate-900 shadow-[0_0_20px_rgba(226,232,240,0.25)] transition hover:from-white hover:to-slate-100"
              >
                继续行动：封卷回首页
                <span className="mt-0.5 block text-center text-[11px] font-medium normal-case tracking-normal text-slate-700">
                  清空本局存档后回到主页，再决定开新篇或查看履历
                </span>
              </button>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-center sm:gap-3">
              <button
                type="button"
                onClick={() => setArchiveOpen((o) => !o)}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-500/50 bg-slate-800/80 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-400 hover:bg-slate-800"
              >
                {archiveOpen ? "收起本局归档" : "查看本局归档"}
              </button>
              <Link
                href="/history"
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-500/50 bg-slate-800/50 px-4 text-sm font-semibold text-slate-100 transition hover:border-indigo-400/40 hover:bg-slate-800/90"
              >
                书写履历（全部对局）
              </Link>
            </div>

            <button
              type="button"
              onClick={handleExport}
              className="min-h-[40px] w-full rounded-xl border border-dashed border-slate-600/70 bg-transparent px-4 text-xs font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            >
              导出本局写作稿（.md · 与履历快照同源）
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
