// src/app/settlement/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGameStore } from "@/store/useGameStore";
import { submitGameRecord } from "@/app/actions/leaderboard";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { deleteCloudSaveSlot, enqueueReviveWorldAdvanceJob } from "@/app/actions/save";
import { useAchievementsStore } from "@/store/useAchievementsStore";
import { GuestSoftNudge } from "@/components/GuestSoftNudge";
import { useMounted } from "@/hooks/useMounted";
import { LOCATION_LABELS } from "@/features/play/render/locationLabels";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { useClientPageDynamicProps } from "@/lib/next/useClientPageDynamicProps";
import { computeEscapeOutcomeForSettlement } from "@/lib/escapeMainline/selectors";
import { normalizeEscapeMainline } from "@/lib/escapeMainline/reducer";
import { REVIVE_TIME_SKIP_HOURS } from "@/lib/revive/pipeline";
import { applyNarrativeFeatureEvent } from "@/features/play/narrativeFeatureTriggers";
import {
  settlementReviveCtaSubtitle,
  settlementReviveCtaTitle,
  settlementReviveContractBody,
  settlementReviveContractHeadline,
  settlementRecoveryDisclaimer,
} from "@/lib/ui/deathContractCopy";

type LogEntry = { role: string; content: string; reasoning?: string };

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
  survivalHours: number,
  escapeOutcome: "none" | "true_escape" | "false_escape" | "costly_escape" | "doom"
): SettlementGrade {
  if (isDead) return "E";
  const escaped = escapeOutcome === "true_escape" || escapeOutcome === "costly_escape" || maxFloor >= 99;
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
    "终焉尚未落槌，你却已在规则的缝隙里蹭出一道浅痕。",
    "下一循环里，先护住自己的道心，再谈破局；别用谎话给公寓递刀。",
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
  const hasUploadedRef = useRef(false);
  const hasAchievementPushedRef = useRef(false);
  const fitWrapRef = useRef<HTMLDivElement | null>(null);
  const fitCardRef = useRef<HTMLDivElement | null>(null);

  const stats = useGameStore((s) => s.stats) ?? { sanity: 0, agility: 0, luck: 0, charm: 0, background: 0 };
  const logs = useGameStore((s) => s.logs ?? []);
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");
  const historicalMaxFloorScore = useGameStore((s) => s.historicalMaxFloorScore ?? 0);
  const currentSaveSlot = useGameStore((s) => s.currentSaveSlot ?? "main_slot");
  const reviveContext = useGameStore((s) => s.reviveContext);
  const professionState = useGameStore((s) => s.professionState);

  const sanity = stats?.sanity ?? 0;
  const isDead = sanity <= 0;
  const kills = estimateKilledAnomalies(logs);
  const floorFromLocation = resolveFloorScore(playerLocation);
  const maxFloor = Math.max(floorFromLocation, historicalMaxFloorScore);
  const survivalHours = (time.day ?? 0) * 24 + (time.hour ?? 0);
  const escapeStateRaw = useGameStore((s) => (s as any).escapeMainline);
  const escapeState = normalizeEscapeMainline(escapeStateRaw, survivalHours);
  const escapeOutcome = computeEscapeOutcomeForSettlement(escapeState);
  const grade = computeGrade(isDead, maxFloor, kills, survivalHours, escapeOutcome);
  const [reviewLine1, reviewLine2] = generateSettlementReview(
    grade,
    isDead,
    kills,
    maxFloor
  );

  const revivePenaltyDigest = {
    timeSkipHours: REVIVE_TIME_SKIP_HOURS,
    lostItemCount: 0,
    lootedItemCount: (reviveContext?.droppedLootLedger?.length ?? 0),
    failedTaskCount: 0,
    respawnAnchorLabel: reviveContext?.lastReviveAnchorId ?? null,
  };

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
      outcome: isDead
        ? "death"
        : escapeOutcome === "true_escape" || escapeOutcome === "costly_escape"
          ? "victory"
          : "abandon",
      history: {
        grade,
        survivalDay: time.day ?? 0,
        survivalHour: time.hour ?? 0,
        maxFloorLabel: formatFloorDisplay(maxFloor),
        profession: profession ? String(profession) : null,
        recapSummary,
        isDead,
        hasEscaped: !isDead && (escapeOutcome === "true_escape" || escapeOutcome === "costly_escape" || maxFloor >= 99),
        writingMarkdown,
      },
    });
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
    escapeOutcome,
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
    applyNarrativeFeatureEvent(
      {
        type: "achievement.unlock",
        record: {
          survivalTimeText: `${time.day} 日 ${time.hour} 时`,
          grade,
          kills,
          maxFloor,
          maxFloorDisplay: formatFloorDisplay(maxFloor),
          reviewLine1,
          reviewLine2,
        },
      },
      { addAchievementRecord: (record) => useAchievementsStore.getState().addRecord(record) }
    );
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
    uploadOutcome,
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
    uploadOutcome == null ? null : uploadOutcome.cloudOk && uploadOutcome.historyId != null ? (
      <p className="text-center text-[11px] leading-relaxed text-emerald-200/85">
        <span className="font-semibold text-emerald-100/95">本局结果已完成云端归档。</span>
        排行榜与结算数据已同步，可直接继续下一局。
      </p>
    ) : uploadOutcome.cloudOk ? (
      <p className="text-center text-[11px] leading-relaxed text-amber-200/80">
        本局成绩已同步至服务器（含排行榜统计）。
        <span className="text-amber-100/90"> 若短时未刷新，请稍后重试。</span>
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
        若希望这一局随账号同步：回到首页登录同一笔名后再游玩，后续结算会自动归档到云端。
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
                : escapeOutcome === "true_escape"
                  ? "你走出去了（真正逃离）"
                  : escapeOutcome === "costly_escape"
                    ? "你走出去了（代价逃离）"
                    : escapeOutcome === "false_escape"
                      ? "你走出去了（但那是假的）"
                      : escapeOutcome === "doom"
                        ? "你没能走出去（终焉）"
                        : "你的意识渐渐消散，但一切还未终焉"}
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              {isDead
                ? ""
                : escapeOutcome === "true_escape"
                  ? "你完成了逃离；这局的规则已被你撕开。"
                  : escapeOutcome === "costly_escape"
                    ? "你完成了逃离，但你付出的代价会在身后回响。"
                    : escapeOutcome === "false_escape"
                      ? "你以为走出去了；但真正的门仍未为你打开。"
                      : escapeOutcome === "doom"
                        ? "末日闸门落下；你被迫以终焉收束。"
                        : ""}
            </p>
          </header>

          <div className="space-y-2">
            {persistLine}
            {guestLoginHint}
          </div>

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

          <div className="flex flex-col gap-3 sm:gap-4">
            {isDead ? (
              <>
                <section className="rounded-2xl border border-slate-700/55 bg-slate-950/30 px-4 py-3 text-left">
                  <div className="text-xs font-semibold tracking-[0.22em] text-slate-300">{settlementReviveContractHeadline()}</div>
                  <p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-slate-400">
                    {settlementReviveContractBody()}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{settlementRecoveryDisclaimer()}</p>
                </section>
                <button
                  type="button"
                  onClick={handleReviveNow}
                  className="min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-emerald-300 to-teal-200 px-6 py-3.5 text-base font-bold tracking-wide text-emerald-950 shadow-[0_0_24px_rgba(52,211,153,0.35)] transition hover:from-emerald-200 hover:to-teal-100"
                >
                  {settlementReviveCtaTitle()}
                  <span className="mt-0.5 block text-center text-[11px] font-medium normal-case tracking-normal text-emerald-950/80">
                    {settlementReviveCtaSubtitle(revivePenaltyDigest)}
                  </span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handleRestart()}
                className="min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-slate-100 to-slate-200 px-6 py-3.5 text-base font-bold tracking-wide text-slate-900 shadow-[0_0_20px_rgba(226,232,240,0.25)] transition hover:from-white hover:to-slate-100"
              >
                继续行动：返回首页
                <span className="mt-0.5 block text-center text-[11px] font-medium normal-case tracking-normal text-slate-700">
                  本局将被归档；回到主页，再决定开始新篇或继续行动
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExport}
              className="min-h-[40px] w-full rounded-xl border border-dashed border-slate-600/70 bg-transparent px-4 text-xs font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            >
              导出本局写作稿（.md）
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
