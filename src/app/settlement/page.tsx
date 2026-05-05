"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCloudSaveSlot } from "@/app/actions/save";
import { submitGameRecord } from "@/app/actions/leaderboard";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { LOCATION_LABELS } from "@/features/play/render/locationLabels";
import { applyNarrativeFeatureEvent } from "@/features/play/narrativeFeatureTriggers";
import { useMounted } from "@/hooks/useMounted";
import { computeEscapeOutcomeForSettlement } from "@/lib/escapeMainline/selectors";
import { normalizeEscapeMainline } from "@/lib/escapeMainline/reducer";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { useClientPageDynamicProps } from "@/lib/next/useClientPageDynamicProps";
import {
  computeSettlementGrade,
  formatSettlementFloor,
  getSettlementGradeCaption,
  resolveSettlementFloorScore,
  type SettlementEscapeOutcome,
} from "@/lib/settlement/rules";
import { useAchievementsStore } from "@/store/useAchievementsStore";
import { useGameStore } from "@/store/useGameStore";

type LogEntry = { role: string; content: string; reasoning?: string };

function replaceLocationIdsForDisplay(text: string): string {
  let out = String(text ?? "");
  for (const [id, label] of Object.entries(LOCATION_LABELS)) {
    if (!id || !label) continue;
    out = out.replaceAll(id, label);
  }
  return out;
}

function buildMarkdown(logs: LogEntry[]): string {
  const lines = ["# 文界工坊 · 本局写作稿", "", "---", ""];
  for (const entry of logs) {
    if (entry.role === "user") {
      lines.push("## 玩家行动", "", replaceLocationIdsForDisplay(entry.content), "", "---", "");
    } else if (entry.role === "assistant") {
      lines.push("## 剧情叙事", "", replaceLocationIdsForDisplay(entry.content), "", "---", "");
    } else if (entry.role === "system") {
      lines.push("## 系统指令", "", "```", replaceLocationIdsForDisplay(entry.content), "```", "", "---", "");
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

function estimateKilledAnomalies(logs: LogEntry[]): number {
  const text = logs
    .filter((item) => item.role === "assistant")
    .map((item) => item.content)
    .join("\n");
  const matches = text.match(/(?:消灭|击杀|杀死|解决|压制).{0,8}诡异|诡异.{0,8}(?:消灭|击杀|杀死|解决|压制)/g);
  return matches ? Math.max(0, matches.length) : 0;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[8.5rem] flex-col items-center justify-center rounded-[14px] border border-[#4c8b83] bg-[#fffdf8]/78 px-4 text-center">
      <div className="vc-reading-serif text-[clamp(1.1rem,2.2vw,1.55rem)] text-[#0f5a52]">{label}</div>
      <div className="vc-reading-serif mt-5 text-[clamp(1.55rem,3vw,2.15rem)] font-semibold leading-none text-[#0f5a52]">
        {value}
      </div>
    </div>
  );
}

export default function SettlementPage(props: AppPageDynamicProps) {
  useClientPageDynamicProps(props);
  const router = useRouter();
  const mounted = useMounted();
  const hasUploadedRef = useRef(false);
  const hasAchievementPushedRef = useRef(false);
  const [returningHome, setReturningHome] = useState(false);

  const stats = useGameStore((s) => s.stats) ?? { sanity: 0, agility: 0, luck: 0, charm: 0, background: 0 };
  const logs = useGameStore((s) => (s.logs ?? []) as LogEntry[]);
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");
  const historicalMaxFloorScore = useGameStore((s) => s.historicalMaxFloorScore ?? 0);
  const currentSaveSlot = useGameStore((s) => s.currentSaveSlot ?? "main_slot");
  const professionState = useGameStore((s) => s.professionState);
  const escapeStateRaw = useGameStore((s) => (s as { escapeMainline?: unknown }).escapeMainline);

  const survivalDay = Math.max(0, Number(time.day ?? 0));
  const survivalHour = Math.max(0, Number(time.hour ?? 0));
  const isDead = (stats.sanity ?? 0) <= 0;
  const killedAnomalies = estimateKilledAnomalies(logs);
  const survivalHours = survivalDay * 24 + survivalHour;
  const maxFloorScore = Math.max(resolveSettlementFloorScore(playerLocation), historicalMaxFloorScore);
  const escapeState = normalizeEscapeMainline(escapeStateRaw, survivalHours);
  const escapeOutcome = computeEscapeOutcomeForSettlement(escapeState) as SettlementEscapeOutcome;
  const grade = computeSettlementGrade({
    isDead,
    maxFloor: maxFloorScore,
    killedAnomalies,
    survivalHours,
    escapeOutcome,
  });
  const gradeCaption = getSettlementGradeCaption(grade, escapeOutcome);
  const maxFloorLabel = formatSettlementFloor(maxFloorScore);
  const writingMarkdown = useMemo(() => buildMarkdown(logs), [logs]);

  const handleSubmit = useCallback(async () => {
    if (hasUploadedRef.current) return;
    hasUploadedRef.current = true;
    const profession = professionState?.currentProfession ?? null;
    await submitGameRecord({
      killedAnomalies,
      maxFloorScore,
      survivalTimeSeconds: survivalHours * 3600,
      outcome: isDead
        ? "death"
        : escapeOutcome === "true_escape" || escapeOutcome === "costly_escape"
          ? "victory"
          : "abandon",
      history: {
        grade,
        survivalDay,
        survivalHour,
        maxFloorLabel,
        profession: profession ? String(profession) : null,
        recapSummary: gradeCaption,
        isDead,
        hasEscaped: !isDead && (escapeOutcome === "true_escape" || escapeOutcome === "costly_escape"),
        writingMarkdown,
      },
    }).catch(() => undefined);
  }, [
    escapeOutcome,
    grade,
    gradeCaption,
    isDead,
    killedAnomalies,
    maxFloorLabel,
    maxFloorScore,
    professionState?.currentProfession,
    survivalDay,
    survivalHour,
    survivalHours,
    writingMarkdown,
  ]);

  useEffect(() => {
    if (!mounted) return;
    void handleSubmit();
  }, [mounted, handleSubmit]);

  useEffect(() => {
    if (!mounted) return;
    void trackGameplayEvent({
      eventName: "settlement_viewed",
      page: "/settlement",
      source: "settlement",
      payload: { isDead, grade, killedAnomalies, maxFloorScore, survivalHours },
    }).catch(() => {});
  }, [mounted, isDead, grade, killedAnomalies, maxFloorScore, survivalHours]);

  useEffect(() => {
    if (!mounted || hasAchievementPushedRef.current) return;
    hasAchievementPushedRef.current = true;
    applyNarrativeFeatureEvent(
      {
        type: "achievement.unlock",
        record: {
          survivalTimeText: `${survivalDay} 日 ${survivalHour} 时`,
          grade,
          kills: killedAnomalies,
          maxFloor: maxFloorScore,
          maxFloorDisplay: maxFloorLabel,
          reviewLine1: gradeCaption,
          reviewLine2: "",
        },
      },
      { addAchievementRecord: (record) => useAchievementsStore.getState().addRecord(record) }
    );
  }, [mounted, grade, gradeCaption, killedAnomalies, maxFloorLabel, maxFloorScore, survivalDay, survivalHour]);

  function handleExport() {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    void trackGameplayEvent({
      eventName: "settlement_export_clicked",
      page: "/settlement",
      source: "settlement",
      payload: { grade, maxFloorScore },
    }).catch(() => {});
    triggerDownload(writingMarkdown, `versecraft-writing-${ts}.md`);
  }

  async function handleReturnHome() {
    if (returningHome) return;
    setReturningHome(true);
    const slotId = currentSaveSlot || "main_slot";
    const autoSlotId = slotId === "main_slot" ? "auto_main" : `auto_${slotId}`;
    useGameStore.getState().destroySaveData();
    await Promise.all([
      deleteCloudSaveSlot(slotId).catch(() => ({ ok: false as const })),
      deleteCloudSaveSlot(autoSlotId).catch(() => ({ ok: false as const })),
    ]);
    router.push("/");
  }

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f2ec] text-[#0f5a52]">
        <div className="vc-reading-serif animate-pulse text-xl">结算中...</div>
      </main>
    );
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#f6f2ec] px-4 py-8 text-[#0f5a52] sm:px-8 sm:py-16">
      <section
        data-testid="settlement-paper-card"
        className="relative mx-auto flex min-h-[min(88dvh,860px)] w-full max-w-[1040px] flex-col items-center justify-center rounded-[32px] border border-[#decfbb] bg-[#fffdf8]/96 px-[clamp(1.6rem,7vw,6rem)] py-[clamp(2rem,7vw,5.4rem)] shadow-[0_24px_74px_rgba(76,61,42,0.18),inset_0_0_0_10px_rgba(248,243,235,0.96),inset_0_0_0_11px_rgba(218,207,191,0.72),inset_0_0_0_24px_rgba(255,253,248,0.9),inset_0_0_0_25px_rgba(226,216,200,0.62)] sm:rounded-[42px]"
      >
        <header className="text-center">
          <div
            className="vc-reading-serif text-[clamp(4.7rem,10vw,7.4rem)] font-semibold leading-none text-[#0f5a52] drop-shadow-[0_4px_10px_rgba(15,90,82,0.18)]"
            aria-label={`结算评级：${grade}`}
          >
            {grade}
          </div>
          <h1 className="vc-reading-serif mt-7 text-[clamp(1.75rem,4vw,3rem)] font-semibold leading-tight text-[#0f5a52]">
            {gradeCaption}
          </h1>
        </header>

        <section
          data-testid="settlement-metrics"
          className="mt-[clamp(2.4rem,6vw,5rem)] w-full rounded-[18px] border border-[#4c8b83] bg-[#fffdf8]/66 p-[clamp(1.2rem,3vw,2.2rem)]"
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <StatTile label="存活时间" value={`${survivalDay} 日 ${survivalHour} 时`} />
            <StatTile label="消灭诡异" value={`${killedAnomalies} 只`} />
            <StatTile label="最高抵达" value={maxFloorLabel} />
          </div>
        </section>

        <div className="mt-[clamp(1.8rem,4vw,2.8rem)] flex w-full flex-col gap-6">
          <button
            type="button"
            onClick={() => void handleReturnHome()}
            disabled={returningHome}
            data-testid="settlement-return-home"
            className="vc-reading-serif min-h-[4.3rem] w-full rounded-[16px] border border-[#0f5a52] bg-[#fffdf8]/82 px-6 text-[clamp(1.55rem,3vw,2.25rem)] font-semibold text-[#0f5a52] transition hover:bg-white disabled:opacity-60"
          >
            返回首页
          </button>
          <button
            type="button"
            onClick={handleExport}
            data-testid="settlement-export-writing"
            className="vc-reading-serif min-h-[3.7rem] w-full rounded-[16px] border border-dashed border-[#4c8b83] bg-transparent px-6 text-[clamp(1.25rem,2.4vw,1.8rem)] font-semibold text-[#0f5a52] transition hover:bg-white/60"
          >
            导出本局写作稿
          </button>
        </div>
      </section>
    </main>
  );
}
