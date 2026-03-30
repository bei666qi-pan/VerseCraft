"use client";

import { useMemo, useState } from "react";
import type { ClueEntry } from "@/lib/domain/narrativeDomain";
import type { CodexEntry, GameTask } from "@/store/useGameStore";
import {
  resolveFloorTierLabel,
  resolveItemIdForPlayer,
  resolveNpcIdForPlayer,
  resolveTaskIssuerDisplay,
} from "@/lib/ui/displayNameResolvers";
import { filterTasksForTaskBoardVisibilityV2, goalKindLabel, partitionTasksForBoard } from "@/lib/play/taskBoardUi";
import { getClientTaskVisibilityPolicyV2Enabled } from "@/lib/rollout/versecraftClientRollout";
import { getTaskStatusLabel } from "@/lib/tasks/taskV2";

function taskSummaryLine(t: GameTask): string {
  const u = (t as { urgencyReason?: string }).urgencyReason;
  const h = (t as { playerHook?: string }).playerHook;
  const hint = t.nextHint;
  const raw = (typeof u === "string" && u.trim()) || (typeof h === "string" && h.trim()) || (typeof hint === "string" && hint.trim()) || t.desc;
  return raw.length > 120 ? `${raw.slice(0, 118)}…` : raw;
}

function cluesForTask(taskId: string, clues: ClueEntry[] | undefined): ClueEntry[] {
  if (!clues?.length) return [];
  return clues.filter((c) => c.relatedObjectiveId === taskId).slice(0, 4);
}

function itemLabelsForTask(task: GameTask): string[] {
  const ids = new Set<string>([...(task.relatedItemIds ?? []), ...(task.reward?.items ?? [])].filter(Boolean));
  return [...ids].map((id) => resolveItemIdForPlayer(id)).slice(0, 4);
}

function requiredItemLabels(task: GameTask): string[] {
  const req = task.requiredItemIds;
  if (!req?.length) return [];
  return [...new Set(req.filter(Boolean))].slice(0, 8).map((id) => resolveItemIdForPlayer(id));
}

/** 与托付人不同的「还牵涉谁」，避免把 registry id 露给玩家 */
function relatedPeopleLine(task: GameTask, codex: Record<string, CodexEntry> | undefined): string | null {
  const issuer = String(task.issuerId ?? "").trim();
  const ids = [...new Set((task.relatedNpcIds ?? []).filter(Boolean))].filter((id) => id !== issuer).slice(0, 4);
  if (ids.length === 0) return null;
  return `还可能和谁有关：${ids.map((id) => resolveNpcIdForPlayer(id, codex)).join("、")}`;
}

function statusStyle(status: GameTask["status"], mode: "light" | "dark"): string {
  if (mode === "light") {
    if (status === "active") return "border-amber-200 bg-amber-50 text-amber-800";
    if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (status === "available") return "border-indigo-200 bg-indigo-50 text-indigo-800";
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (status === "active") return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  if (status === "completed") return "border-emerald-400/35 bg-emerald-500/10 text-emerald-200";
  if (status === "available") return "border-indigo-400/35 bg-indigo-500/10 text-indigo-200";
  return "border-rose-400/35 bg-rose-500/10 text-rose-200";
}

export type PlayNarrativeTaskBoardProps = {
  tasks: GameTask[];
  originium: number;
  journalClues?: ClueEntry[];
  codex?: Record<string, CodexEntry>;
  highlightTaskIds?: string[];
  onClaimTask: (taskId: string) => void;
  density: "overlay" | "embedded";
};

export function PlayNarrativeTaskBoard({
  tasks,
  originium,
  journalClues,
  codex,
  highlightTaskIds,
  onClaimTask,
  density,
}: PlayNarrativeTaskBoardProps) {
  const [showMore, setShowMore] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const mode = density === "overlay" ? "light" : "dark";

  const { primary, paths, promiseRisk, overflow, completed, failed } = useMemo(() => {
    const v2 = getClientTaskVisibilityPolicyV2Enabled();
    const forBoard = filterTasksForTaskBoardVisibilityV2(tasks ?? [], v2);
    return partitionTasksForBoard(forBoard, 4);
  }, [tasks]);

  const highlightSet = useMemo(
    () => new Set((highlightTaskIds ?? []).filter((x): x is string => typeof x === "string" && x.trim().length > 0)),
    [highlightTaskIds]
  );

  const isOverlay = density === "overlay";
  const sectionTitle = isOverlay ? "text-[11px] font-semibold uppercase tracking-wider text-slate-500" : "text-[11px] font-semibold uppercase tracking-wider text-slate-400";
  const cardBase = isOverlay
    ? "rounded-xl border bg-white p-3"
    : "rounded-xl border border-white/10 bg-white/5 p-3";

  function renderTaskCard(t: GameTask, opts: { emphasize?: boolean }) {
    const emphasize = opts.emphasize ?? false;
    const highlighted = highlightSet.has(t.id);
    const rk = goalKindLabel(t);
    const clueTitles = cluesForTask(t.id, journalClues).map((c) => c.title);
    const items = itemLabelsForTask(t);
    const requiredItems = requiredItemLabels(t);
    const relatedPeople = relatedPeopleLine(t, codex);

    const ring = highlighted
      ? isOverlay
        ? "ring-2 ring-amber-200/60 shadow-[0_0_0_3px_rgba(251,191,36,0.12)] animate-[halo-pulse_1.8s_ease-in-out_2]"
        : "ring-2 ring-amber-400/40 shadow-[0_0_0_2px_rgba(251,191,36,0.15)]"
      : "";

    const emphasis = emphasize
      ? isOverlay
        ? "border-amber-300/80 bg-gradient-to-br from-amber-50 to-white shadow-sm"
        : "border-amber-400/50 bg-gradient-to-br from-amber-500/15 to-white/5"
      : isOverlay
        ? "border-slate-200"
        : "border-white/10";

    return (
      <article key={t.id} className={`${cardBase} ${emphasis} ${ring} transition`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {emphasize ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isOverlay ? "bg-amber-100 text-amber-900" : "bg-amber-500/25 text-amber-100"
                  }`}
                >
                  正在推进
                </span>
              ) : null}
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle(t.status, mode)}`}
              >
                {getTaskStatusLabel(t.status)}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  isOverlay
                    ? "border-slate-200 bg-slate-50 text-slate-600"
                    : "border-white/15 bg-white/10 text-slate-200"
                }`}
              >
                {rk}
              </span>
            </div>
            <h4 className={`mt-1.5 line-clamp-2 text-sm font-semibold ${isOverlay ? "text-slate-800" : "text-white"}`}>
              {t.title}
            </h4>
          </div>
        </div>
        <p className={`mt-1.5 line-clamp-3 text-xs ${isOverlay ? "text-slate-600" : "text-slate-300"}`}>{taskSummaryLine(t)}</p>
        {(t as { riskNote?: string }).riskNote && (t.status === "active" || t.status === "available") ? (
          <p
            className={`mt-1.5 rounded-lg border px-2 py-1 text-[11px] ${
              isOverlay
                ? "border-rose-200/60 bg-rose-50/80 text-rose-800"
                : "border-rose-500/30 bg-rose-500/10 text-rose-100"
            }`}
          >
            险情：{String((t as { riskNote?: string }).riskNote).slice(0, 160)}
            {String((t as { riskNote?: string }).riskNote).length > 160 ? "…" : ""}
          </p>
        ) : null}
        <div className={`mt-2 space-y-1 text-[11px] ${isOverlay ? "text-slate-500" : "text-slate-400"}`}>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span>谁托付给你：{resolveTaskIssuerDisplay(t.issuerId, t.issuerName, codex)}</span>
            <span>大致位置：{resolveFloorTierLabel(t.floorTier)}</span>
          </div>
          {relatedPeople ? <p>{relatedPeople}</p> : null}
          {clueTitles.length > 0 ? (
            <p>
              <span className={`font-medium ${isOverlay ? "text-cyan-700" : "text-cyan-300"}`}>手记里沾边的：</span>
              {clueTitles.join("；")}
            </p>
          ) : null}
          {requiredItems.length > 0 ? (
            <p>
              <span className={`font-medium ${isOverlay ? "text-amber-800" : "text-amber-200"}`}>你还缺：</span>
              {requiredItems.join("、")}
            </p>
          ) : null}
          {items.length > 0 ? (
            <p>
              <span className={`font-medium ${isOverlay ? "text-indigo-700" : "text-indigo-300"}`}>相关物与可能回报：</span>
              {items.join("、")}
            </p>
          ) : null}
        </div>
        <div className="mt-2.5 flex items-center justify-end gap-2">
          {t.status === "available" && t.claimMode === "manual" ? (
            <button
              type="button"
              onClick={() => onClaimTask(t.id)}
              className={
                isOverlay
                  ? "rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                  : "rounded-lg border border-indigo-300/30 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold text-indigo-100 hover:bg-indigo-500/20"
              }
            >
              接取
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  const visibleCount = (tasks ?? []).filter((t) => t && t.status !== "hidden").length;
  if (visibleCount === 0) {
    return (
      <div
        className={
          isOverlay
            ? "rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500"
            : "rounded-xl border border-white/10 bg-white/5 p-6 text-center text-xs text-slate-500"
        }
      >
        暂时没有要跟的事。多走走、多问问，可能会有人把麻烦交到你手里。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className={sectionTitle}>目标板</p>
        <span
          className={
            isOverlay
              ? "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
              : "inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200"
          }
        >
          原石 {originium}
        </span>
      </div>

      {primary ? (
        <div>
          <p className={`mb-2 ${sectionTitle}`}>正在推进</p>
          {renderTaskCard(primary, { emphasize: true })}
        </div>
      ) : null}

      {paths.length > 0 ? (
        <div>
          <p className={`mb-2 ${sectionTitle}`}>还能试的方向</p>
          <div className="space-y-2.5">{paths.map((t) => renderTaskCard(t, { emphasize: false }))}</div>
        </div>
      ) : null}

      {promiseRisk.length > 0 ? (
        <div>
          <p className={`mb-2 ${sectionTitle}`}>约定·托付·险情</p>
          <div className="space-y-2.5">{promiseRisk.map((t) => renderTaskCard(t, { emphasize: false }))}</div>
        </div>
      ) : null}

      {overflow.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[11px] font-medium transition ${
              isOverlay
                ? "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <span>更多在办（{overflow.length}）</span>
            <span className="text-slate-400">{showMore ? "收起" : "展开"}</span>
          </button>
          {showMore ? <div className="space-y-2.5">{overflow.map((t) => renderTaskCard(t, { emphasize: false }))}</div> : null}
        </div>
      ) : null}

      {completed.length + failed.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[11px] font-medium transition ${
              isOverlay
                ? "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <span>
              收起的记录：已完成 {completed.length} · 落空 {failed.length}
            </span>
            <span className="text-slate-400">{showClosed ? "收起" : "展开"}</span>
          </button>
          {showClosed ? (
            <div className="space-y-2.5 opacity-80">
              {[...completed, ...failed].map((t) => renderTaskCard(t, { emphasize: false }))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
