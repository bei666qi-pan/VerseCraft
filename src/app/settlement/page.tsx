"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { deleteCloudSaveSlot } from "@/app/actions/save";
import { submitSettlementHistory } from "@/app/actions/history";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { LOCATION_LABELS } from "@/features/play/render/locationLabels";
import { applyNarrativeFeatureEvent } from "@/features/play/narrativeFeatureTriggers";
import { useMounted } from "@/hooks/useMounted";
import { normalizeEscapeMainline } from "@/lib/escapeMainline/reducer";
import { computeEscapeOutcomeForSettlement } from "@/lib/escapeMainline/selectors";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { useClientPageDynamicProps } from "@/lib/next/useClientPageDynamicProps";
import {
  computeSettlementGrade,
  formatSettlementFloor,
  getSettlementGradeCaption,
  getSettlementOutcomeLead,
  getSettlementOutcomeTitle,
  resolveSettlementFloorScore,
  type SettlementOutcome,
} from "@/lib/settlement/rules";
import { useAchievementsStore } from "@/store/useAchievementsStore";
import { useGameStore } from "@/store/useGameStore";
import type { EndingOutcome, EndingSettlementSnapshot } from "@/lib/endings/types";
import {
  buildEndingTelemetryIdempotencyKey,
  buildEndingTelemetryPayload,
  type EndingTelemetryEventName,
} from "@/lib/endings/telemetry";
import { pushEndingDecisionDebugEvent } from "@/lib/debug/narrativeSystemsDebugRing";

type LogEntry = { role: string; content: string; reasoning?: string };
type SettlementSource = "ending_snapshot" | "legacy_fallback";
type SettlementViewSnapshot = EndingSettlementSnapshot & { source: SettlementSource };
const FALLBACK_SETTLEMENT_STATS = { sanity: 0, agility: 0, luck: 0, charm: 0, background: 0 };

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

function asSettlementOutcome(outcome: EndingOutcome | SettlementOutcome | null | undefined): SettlementOutcome {
  if (
    outcome === "death" ||
    outcome === "doom" ||
    outcome === "true_escape" ||
    outcome === "costly_escape" ||
    outcome === "false_escape" ||
    outcome === "abandon"
  ) {
    return outcome;
  }
  return "none";
}

function asEndingOutcome(outcome: SettlementOutcome): EndingOutcome {
  return outcome === "none" ? "abandon" : outcome;
}

function compactLines(values: readonly unknown[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const text = String(raw ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(replaceLocationIdsForDisplay(text).slice(0, 160));
    if (out.length >= cap) break;
  }
  return out;
}

function buildHistoryRecap(snapshot: SettlementViewSnapshot): string {
  const parts = [snapshot.title, snapshot.caption, getSettlementOutcomeLead(asSettlementOutcome(snapshot.outcome))];
  if (snapshot.finalChoiceLabel) parts.push(`最终选择：${snapshot.finalChoiceLabel}`);
  if (snapshot.outcome === "death") {
    if (snapshot.deathCause) parts.push(`死因：${snapshot.deathCause}`);
    if (snapshot.deathLocation) parts.push(`地点：${replaceLocationIdsForDisplay(snapshot.deathLocation)}`);
    if (snapshot.lastAction) parts.push(`最后行动：${snapshot.lastAction}`);
  }
  return parts.filter(Boolean).join("\n");
}

function buildLegacySnapshot(input: {
  stats: { sanity?: number | null };
  logs: LogEntry[];
  time: { day?: number | null; hour?: number | null };
  playerLocation: string;
  historicalMaxFloorScore: number;
  escapeStateRaw: unknown;
  currentSaveSlot: string;
  codex: Record<string, unknown>;
  journalClues: unknown[];
}): SettlementViewSnapshot {
  const survivalDay = Math.max(0, Number(input.time.day ?? 0));
  const survivalHour = Math.max(0, Number(input.time.hour ?? 0));
  const survivalHours = survivalDay * 24 + survivalHour;
  const isDead = Number(input.stats.sanity ?? 0) <= 0;
  const escapeState = normalizeEscapeMainline(input.escapeStateRaw, survivalHours);
  const escapeOutcome = computeEscapeOutcomeForSettlement(escapeState);
  const outcome = asEndingOutcome(isDead ? "death" : asSettlementOutcome(escapeOutcome));
  const killedAnomalies = estimateKilledAnomalies(input.logs);
  const maxFloorScore = Math.max(resolveSettlementFloorScore(input.playerLocation), input.historicalMaxFloorScore);
  const grade = computeSettlementGrade({
    isDead,
    maxFloor: maxFloorScore,
    killedAnomalies,
    survivalHours,
    escapeOutcome: outcome,
  });
  const lastAssistant = [...input.logs].reverse().find((entry) => entry.role === "assistant")?.content ?? "";
  const keyChoices = compactLines(
    input.logs.filter((entry) => entry.role === "user").map((entry) => entry.content).slice(-12),
    12
  );
  const obtainedClues = compactLines(
    [
      ...input.journalClues.map((clue: any) => clue?.title ?? clue?.name ?? clue?.id),
      ...Object.values(input.codex).map((entry: any) => entry?.name ?? entry?.id),
    ],
    16
  );
  const title = getSettlementOutcomeTitle(outcome);
  const caption = getSettlementGradeCaption(grade, outcome);
  const writingMarkdown = buildMarkdown(input.logs);
  return {
    v: 1,
    source: "legacy_fallback",
    runId: `legacy:${input.currentSaveSlot || "main_slot"}`,
    settlementId: `legacy:${input.currentSaveSlot || "main_slot"}:${survivalHours}:${outcome}`,
    outcome,
    grade,
    title,
    caption,
    finalNarrative:
      replaceLocationIdsForDisplay(lastAssistant).trim() ||
      "这份结算来自旧存档兼容路径：系统没有找到不可变结算快照，因此用当前本地状态重建了本局终章。",
    survivalHours,
    survivalDay,
    survivalHour,
    maxFloorScore,
    maxFloorLabel: formatSettlementFloor(maxFloorScore),
    killedAnomalies,
    keyChoices,
    obtainedClues,
    npcEpilogues: compactLines(
      Object.values(input.codex)
        .filter((entry: any) => entry?.type === "npc")
        .map((entry: any) => `${entry?.name ?? entry?.id ?? "某位住户"}：后日谈未被旧存档完整记录。`),
      8
    ),
    worldStateLines: [
      `结算来源：legacy_fallback`,
      `最终位置：${replaceLocationIdsForDisplay(input.playerLocation)}`,
      `逃离主线：${escapeState.stage}`,
      `理智：${input.stats.sanity ?? 0}`,
    ],
    createdAt: new Date().toISOString(),
    writingMarkdown,
  };
}

function DetailList({ empty, items }: { empty: string; items: readonly string[] }) {
  if (items.length === 0) return <p className="text-[15px] leading-relaxed text-[#6c5946]">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {items.map((item, index) => (
        <li key={`${item}:${index}`} className="border-l-2 border-[#9b6b48] pl-3 text-[15px] leading-relaxed text-[#3c2417]">
          {item}
        </li>
      ))}
    </ul>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#d9c7ad] bg-[#fffdf8] p-4">
      <p className="text-[12px] font-semibold tracking-[0.12em] text-[#8a5a3a]">{label}</p>
      <p className="mt-2 vc-reading-serif text-[24px] font-semibold leading-tight text-[#2f4f48]">{value}</p>
    </div>
  );
}

function StorySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[#e2d6c6] py-6">
      <h2 className="vc-reading-serif text-[22px] font-semibold leading-tight text-[#2f4f48]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function SettlementPage(props: AppPageDynamicProps) {
  useClientPageDynamicProps(props);
  const router = useRouter();
  const mounted = useMounted();
  const historySubmittedRef = useRef(false);
  const historySubmittingRef = useRef(false);
  const historySubmitPromiseRef = useRef<Promise<boolean> | null>(null);
  const hasAchievementPushedRef = useRef(false);
  const endingTelemetrySeenRef = useRef<Set<string>>(new Set());
  const [returningHome, setReturningHome] = useState(false);
  const [showFullText, setShowFullText] = useState(false);

  const storeStats = useGameStore((s) => s.stats);
  const stats = useMemo(() => storeStats ?? FALLBACK_SETTLEMENT_STATS, [storeStats]);
  const logs = useGameStore((s) => (s.logs ?? []) as LogEntry[]);
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");
  const historicalMaxFloorScore = useGameStore((s) => s.historicalMaxFloorScore ?? 0);
  const currentSaveSlot = useGameStore((s) => s.currentSaveSlot ?? "main_slot");
  const professionState = useGameStore((s) => s.professionState);
  const escapeStateRaw = useGameStore((s) => (s as { escapeMainline?: unknown }).escapeMainline);
  const codex = useGameStore((s) => s.codex ?? {});
  const journalClues = useGameStore((s) => s.journalClues ?? []);
  const endingState = useGameStore((s) => s.endingState);
  const markEndingSettled = useGameStore((s) => s.markEndingSettled);

  const snapshot = useMemo<SettlementViewSnapshot>(() => {
    const endingSnapshot = endingState?.settlementSnapshot;
    if (endingSnapshot) {
      return {
        ...endingSnapshot,
        source: "ending_snapshot",
        finalNarrative: replaceLocationIdsForDisplay(endingSnapshot.finalNarrative),
        deathLocation: endingSnapshot.deathLocation
          ? replaceLocationIdsForDisplay(endingSnapshot.deathLocation)
          : endingSnapshot.deathLocation,
        worldStateLines: compactLines(endingSnapshot.worldStateLines ?? [], 16),
        keyChoices: compactLines(endingSnapshot.keyChoices ?? [], 12),
        obtainedClues: compactLines(endingSnapshot.obtainedClues ?? [], 16),
        npcEpilogues: compactLines(endingSnapshot.npcEpilogues ?? [], 16),
      };
    }
    return buildLegacySnapshot({
      stats,
      logs,
      time,
      playerLocation,
      historicalMaxFloorScore,
      escapeStateRaw,
      currentSaveSlot,
      codex,
      journalClues,
    });
  }, [
    codex,
    currentSaveSlot,
    endingState?.settlementSnapshot,
    escapeStateRaw,
    historicalMaxFloorScore,
    journalClues,
    logs,
    playerLocation,
    stats,
    time,
  ]);

  const outcome = asSettlementOutcome(snapshot.outcome);
  const isDead = outcome === "death";
  const hasEscaped = outcome === "true_escape" || outcome === "costly_escape";
  const historyRecap = useMemo(() => buildHistoryRecap(snapshot), [snapshot]);

  const emitSettlementEndingTelemetry = useCallback(
    (
      eventName: EndingTelemetryEventName,
      options: {
        source: string;
        extra?: Record<string, unknown>;
        idempotencySuffix?: string | null;
        once?: boolean;
        note?: string;
      }
    ) => {
      const latestStore = useGameStore.getState();
      const latestEndingState = latestStore.endingState ?? endingState ?? null;
      const escapeStage = normalizeEscapeMainline(escapeStateRaw, snapshot.survivalHours).stage;
      const eligibility = latestEndingState?.eligibility ?? null;
      const payload = buildEndingTelemetryPayload({
        endingState: latestEndingState,
        runId: snapshot.runId,
        escapeStage,
        time,
        source: options.source,
        extra: {
          outcome: snapshot.outcome,
          endingPhase: latestEndingState?.phase ?? "settlement_ready",
          detectedAtTurn: eligibility?.detectedAtTurn ?? null,
          idempotencyKey: latestEndingState?.idempotencyKey ?? null,
          reasons: eligibility?.reasons ?? [],
          blockers: eligibility?.blockers ?? [],
          survivalHours: snapshot.survivalHours,
          snapshotPresent: snapshot.source === "ending_snapshot",
          settlementId: snapshot.settlementId,
          settlementSource: snapshot.source,
          grade: snapshot.grade,
          ...(options.extra ?? {}),
        },
      });
      const key = buildEndingTelemetryIdempotencyKey(eventName, payload, options.idempotencySuffix);
      if (options.once !== false) {
        if (endingTelemetrySeenRef.current.has(key)) return;
        endingTelemetrySeenRef.current.add(key);
      }
      pushEndingDecisionDebugEvent({ eventName, payload, note: options.note });
      void trackGameplayEvent({
        eventName,
        page: "/settlement",
        source: "ending",
        idempotencyKey: key,
        payload,
      }).catch(() => {});
    },
    [endingState, escapeStateRaw, snapshot, time]
  );

  const submitHistoryOnce = useCallback(
    async () => {
      const latestEnding = useGameStore.getState().endingState;
      if (latestEnding?.settledAt || historySubmittedRef.current) return true;
      if (historySubmitPromiseRef.current) return historySubmitPromiseRef.current;
      const localHistoryKey = `versecraft:settlement-history:${snapshot.settlementId}`;
      if (typeof window !== "undefined" && window.localStorage.getItem(localHistoryKey) === "submitted") {
        historySubmittedRef.current = true;
        if (!latestEnding?.settledAt) {
          markEndingSettled();
          useGameStore.getState().saveGame(useGameStore.getState().currentSaveSlot);
        }
        emitSettlementEndingTelemetry("ending_settlement_history_submitted", {
          source: "history_submit_idempotent",
          idempotencySuffix: "history_submitted",
          extra: { historySubmitted: true, historySubmitSource: "local_idempotent" },
        });
        return true;
      }
      if (historySubmittingRef.current) return false;
      historySubmittingRef.current = true;
      const profession = professionState?.currentProfession ?? null;
      const promise = (async () => {
        const result = await submitSettlementHistory({
          killedAnomalies: snapshot.killedAnomalies,
          maxFloorScore: snapshot.maxFloorScore,
          survivalTimeSeconds: snapshot.survivalHours * 3600,
          outcome: snapshot.outcome,
          history: {
            grade: snapshot.grade,
            survivalDay: snapshot.survivalDay,
            survivalHour: snapshot.survivalHour,
            maxFloorLabel: snapshot.maxFloorLabel,
            profession: profession ? String(profession) : null,
            recapSummary: historyRecap,
            isDead,
            hasEscaped,
            writingMarkdown: snapshot.writingMarkdown,
          },
        }).catch(() => ({ success: false, historyId: null }));
        if (result.success) {
          historySubmittedRef.current = true;
          if (typeof window !== "undefined") {
            window.localStorage.setItem(localHistoryKey, "submitted");
          }
          if (!useGameStore.getState().endingState?.settledAt) {
            markEndingSettled();
            useGameStore.getState().saveGame(useGameStore.getState().currentSaveSlot);
          }
        }
        emitSettlementEndingTelemetry("ending_settlement_history_submitted", {
          source: "history_submit",
          idempotencySuffix: "history_submitted",
          extra: {
            historySubmitted: result.success,
            historyId: result.historyId ?? null,
            blockers: result.success ? [] : ["history_submit_failed"],
          },
        });
        return result.success;
      })();
      historySubmitPromiseRef.current = promise;
      const ok = await promise;
      historySubmittingRef.current = false;
      historySubmitPromiseRef.current = null;
      return ok;
    },
    [
      emitSettlementEndingTelemetry,
      hasEscaped,
      historyRecap,
      isDead,
      markEndingSettled,
      professionState?.currentProfession,
      snapshot,
    ]
  );

  useEffect(() => {
    if (!mounted) return;
    if (endingState?.settledAt) {
      historySubmittedRef.current = true;
      return;
    }
    void submitHistoryOnce();
  }, [endingState?.settledAt, mounted, submitHistoryOnce]);

  useEffect(() => {
    if (!mounted) return;
    void trackGameplayEvent({
      eventName: "settlement_viewed",
      page: "/settlement",
      source: "settlement",
      payload: {
        outcome: snapshot.outcome,
        grade: snapshot.grade,
        killedAnomalies: snapshot.killedAnomalies,
        maxFloorScore: snapshot.maxFloorScore,
        survivalHours: snapshot.survivalHours,
        settlementSource: snapshot.source,
      },
    }).catch(() => {});
    emitSettlementEndingTelemetry("ending_settlement_viewed", {
      source: "settlement_page",
      idempotencySuffix: "viewed",
      extra: {
        outcome: snapshot.outcome,
        grade: snapshot.grade,
        settlementSource: snapshot.source,
      },
    });
    if (snapshot.source === "legacy_fallback") {
      emitSettlementEndingTelemetry("ending_blocked", {
        source: "settlement_legacy_fallback",
        idempotencySuffix: "legacy_snapshot_missing",
        extra: {
          blockers: ["settlement_snapshot_missing"],
          snapshotPresent: false,
        },
      });
    }
  }, [emitSettlementEndingTelemetry, mounted, snapshot]);

  useEffect(() => {
    if (!mounted || hasAchievementPushedRef.current) return;
    hasAchievementPushedRef.current = true;
    applyNarrativeFeatureEvent(
      {
        type: "achievement.unlock",
        record: {
          survivalTimeText: `${snapshot.survivalDay} 日 ${snapshot.survivalHour} 时`,
          grade: snapshot.grade,
          kills: snapshot.killedAnomalies,
          maxFloor: snapshot.maxFloorScore,
          maxFloorDisplay: snapshot.maxFloorLabel,
          reviewLine1: snapshot.caption,
          reviewLine2: getSettlementOutcomeLead(outcome),
        },
      },
      { addAchievementRecord: (record) => useAchievementsStore.getState().addRecord(record) }
    );
  }, [mounted, outcome, snapshot]);

  function handleExport() {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    void trackGameplayEvent({
      eventName: "settlement_export_clicked",
      page: "/settlement",
      source: "settlement",
      payload: { outcome: snapshot.outcome, grade: snapshot.grade, maxFloorScore: snapshot.maxFloorScore },
    }).catch(() => {});
    triggerDownload(snapshot.writingMarkdown || buildMarkdown(logs), `versecraft-writing-${ts}.md`);
  }

  async function clearRunAndLeave(target: "/" | "/intro") {
    if (returningHome) return;
    setReturningHome(true);
    await submitHistoryOnce();
    const slotId = currentSaveSlot || "main_slot";
    const autoSlotId = slotId === "main_slot" ? "auto_main" : `auto_${slotId}`;
    useGameStore.getState().destroySaveData();
    await Promise.all([
      deleteCloudSaveSlot(slotId).catch(() => ({ ok: false as const })),
      deleteCloudSaveSlot(autoSlotId).catch(() => ({ ok: false as const })),
    ]);
    router.push(target);
  }

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f2ec] text-[#2f4f48]">
        <div className="vc-reading-serif animate-pulse text-xl">结算中...</div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#f6f2ec] px-4 py-6 text-[#2f4f48] sm:px-8 sm:py-10">
      <article className="mx-auto w-full max-w-[1040px]">
        <header className="border-b border-[#d8cbb8] pb-6">
          <p className="text-[12px] font-semibold tracking-[0.18em] text-[#9b4d2d]">
            {snapshot.source === "legacy_fallback" ? "LEGACY_FALLBACK" : "ENDING SNAPSHOT"}
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="vc-reading-serif text-[clamp(2.4rem,7vw,5.2rem)] font-semibold leading-none text-[#2f4f48]">
                {snapshot.title || getSettlementOutcomeTitle(outcome)}
              </h1>
              <p className="mt-4 max-w-[760px] text-[17px] leading-relaxed text-[#5f4a37]">{snapshot.caption}</p>
              <p className="mt-2 max-w-[760px] text-[15px] leading-relaxed text-[#7b6652]">
                {getSettlementOutcomeLead(outcome)}
              </p>
            </div>
            <div className="min-w-[8rem] rounded-[8px] border border-[#9b6b48] bg-[#fffdf8] px-5 py-4 text-center">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-[#8a5a3a]">评级</p>
              <p className="vc-reading-serif mt-1 text-[56px] font-semibold leading-none text-[#2f4f48]">{snapshot.grade}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-3 py-6 sm:grid-cols-3">
          <MetricTile label="存活时间" value={`${snapshot.survivalDay} 日 ${snapshot.survivalHour} 时`} />
          <MetricTile label="最高抵达" value={snapshot.maxFloorLabel} />
          <MetricTile label="消灭诡异" value={`${snapshot.killedAnomalies} 只`} />
        </section>

        {isDead ? (
          <section className="mb-6 rounded-[8px] border border-[#9b6b48] bg-[#fffaf0] p-4">
            <h2 className="vc-reading-serif text-[22px] font-semibold text-[#3c2417]">死亡记录</h2>
            <div className="mt-3 grid gap-2 text-[15px] leading-relaxed text-[#5f4a37]">
              <p>死因：{snapshot.deathCause || "未记录"}</p>
              <p>地点：{snapshot.deathLocation || "未记录"}</p>
              <p>最后行动：{snapshot.lastAction || "未记录"}</p>
            </div>
          </section>
        ) : null}

        <StorySection title="最终叙事">
          <div
            data-testid="settlement-final-narrative"
            className="whitespace-pre-wrap vc-reading-serif text-[18px] leading-[2.05] text-[#2d2a24]"
          >
            {snapshot.finalNarrative}
          </div>
        </StorySection>

        <StorySection title="关键选择回顾">
          <DetailList empty="本局没有留下可回顾的关键选择。" items={snapshot.keyChoices} />
        </StorySection>

        <StorySection title="获得线索">
          <DetailList empty="本局没有记录到已获得线索。" items={snapshot.obtainedClues} />
        </StorySection>

        <StorySection title="NPC 后日谈">
          <DetailList empty="本局没有形成可展示的 NPC 后日谈。" items={snapshot.npcEpilogues} />
        </StorySection>

        <StorySection title="世界状态">
          <DetailList empty="本局没有记录额外世界状态。" items={snapshot.worldStateLines} />
        </StorySection>

        {showFullText ? (
          <StorySection title="本局全文">
            <div className="grid gap-5" data-testid="settlement-fulltext">
              {logs.length > 0 ? (
                logs.map((entry, index) => (
                  <section key={`${entry.role}:${index}`} className="border-l-2 border-[#d7bd9b] pl-4">
                    <p className="text-[12px] font-semibold tracking-[0.12em] text-[#8a5a3a]">
                      {entry.role === "user" ? "玩家行动" : entry.role === "assistant" ? "剧情叙事" : "系统记录"}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#2d2a24]">
                      {replaceLocationIdsForDisplay(entry.content)}
                    </p>
                  </section>
                ))
              ) : (
                <p className="text-[15px] leading-relaxed text-[#6c5946]">本地日志已经不可用，只能查看上方最终叙事。</p>
              )}
            </div>
          </StorySection>
        ) : null}

        <section className="grid gap-3 border-t border-[#d8cbb8] py-6 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleExport}
            data-testid="settlement-export-writing"
            className="rounded-[8px] border border-[#9b6b48] bg-[#fffdf8] px-5 py-3 text-[15px] font-semibold text-[#3c2417]"
          >
            导出本局写作稿
          </button>
          <button
            type="button"
            onClick={() => setShowFullText((value) => !value)}
            data-testid="settlement-review-fulltext"
            className="rounded-[8px] border border-[#d7bd9b] bg-[#fffdf8] px-5 py-3 text-[15px] font-semibold text-[#3c2417]"
          >
            {showFullText ? "收起全文" : "回看全文"}
          </button>
          <button
            type="button"
            onClick={() => void clearRunAndLeave("/")}
            disabled={returningHome}
            data-testid="settlement-return-home"
            className="rounded-[8px] border border-[#d7bd9b] bg-[#fffdf8] px-5 py-3 text-[15px] font-semibold text-[#3c2417] disabled:opacity-60"
          >
            返回首页
          </button>
          <button
            type="button"
            onClick={() => void clearRunAndLeave("/intro")}
            disabled={returningHome}
            data-testid="settlement-new-run"
            className="rounded-[8px] bg-[#2f4f48] px-5 py-3 text-[15px] font-semibold text-[#fffdf8] disabled:opacity-60"
          >
            新一局
          </button>
        </section>
      </article>
    </main>
  );
}
