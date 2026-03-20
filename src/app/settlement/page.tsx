// src/app/settlement/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { submitGameRecord } from "@/app/actions/leaderboard";
import { deleteCloudSaveSlot } from "@/app/actions/save";
import { useAchievementsStore } from "@/store/useAchievementsStore";
import { GuestSoftNudge } from "@/components/GuestSoftNudge";
import { useMounted } from "@/hooks/useMounted";

type LogEntry = { role: string; content: string; reasoning?: string };

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
      lines.push(entry.content);
      lines.push("");
      lines.push("---");
      lines.push("");
    } else if (entry.role === "assistant") {
      lines.push("## DM 叙事");
      lines.push("");
      lines.push(entry.content);
      lines.push("");

      if (entry.reasoning && entry.reasoning.trim().length > 0) {
        lines.push("<details>");
        lines.push("<summary>推理过程（折叠）</summary>");
        lines.push("");
        lines.push(entry.reasoning);
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
      lines.push(entry.content);
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

export default function SettlementPage() {
  const mounted = useMounted();
  const [onLeaderboardToast, setOnLeaderboardToast] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const hasUploadedRef = useRef(false);
  const hasAchievementPushedRef = useRef(false);
  const fitWrapRef = useRef<HTMLDivElement | null>(null);
  const fitCardRef = useRef<HTMLDivElement | null>(null);

  const stats = useGameStore((s) => s.stats) ?? { sanity: 0, agility: 0, luck: 0, charm: 0, background: 0 };
  const logs = useGameStore((s) => s.logs ?? []);
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");
  const historicalMaxFloorScore = useGameStore((s) => s.historicalMaxFloorScore ?? 0);

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

  const handleSubmit = useCallback(async () => {
    if (hasUploadedRef.current) return;
    hasUploadedRef.current = true;
    const survivalTimeSeconds = Math.max(0, survivalHours * 3600);
    const res = await submitGameRecord({
      killedAnomalies: kills,
      maxFloorScore: maxFloor,
      survivalTimeSeconds,
    });
    if (res.success && res.onLeaderboard) {
      setOnLeaderboardToast(true);
      setTimeout(() => setOnLeaderboardToast(false), 5000);
    }
  }, [kills, maxFloor, survivalHours]);

  useEffect(() => {
    if (!mounted) return;
    void (async () => {
      await handleSubmit();
      useGameStore.getState().clearSaveForDeath();
      await deleteCloudSaveSlot("auto_save");
    })();
  }, [mounted, handleSubmit]);

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
  }, [mounted, reviewLine1, reviewLine2, isDead, grade, sanity, kills, maxFloor, time.day, time.hour]);

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
    triggerDownload(md, `versecraft-写作记录-${ts}.md`);
  }

  async function handleRestart() {
    useGameStore.getState().destroySaveData();
    await deleteCloudSaveSlot("auto_save");
    const p = useGameStore.persist.clearStorage() as unknown;
    if (p && typeof (p as Promise<unknown>).then === "function") {
      await (p as Promise<void>);
    }
    window.location.href = "/";
  }

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-foreground">
      <GuestSoftNudge context="settlement" />
      {onLeaderboardToast && (
        <div
          className="fixed inset-x-4 top-8 z-50 mx-auto max-w-md rounded-2xl border border-cyan-500/30 bg-slate-900/95 px-5 py-4 shadow-[0_0_30px_rgba(34,211,238,0.15)] backdrop-blur-xl"
          role="alert"
        >
          <p className="text-center text-sm font-medium text-cyan-200">
            强大的冒险者，您已上榜，可前往首页排行榜查看。
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

          <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-3 sm:px-5 sm:py-4">
            <p className="text-sm leading-relaxed text-slate-300">{reviewLine1}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{reviewLine2}</p>
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

          <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={handleExport}
              className="h-12 rounded-xl border border-slate-600 bg-slate-800 px-4 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              导出写作记录 (.md)
            </button>
            <button
              type="button"
              onClick={handleRestart}
              className="h-12 rounded-xl bg-slate-100 px-6 text-sm font-semibold text-slate-900 transition hover:bg-white"
            >
              回到主页
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
