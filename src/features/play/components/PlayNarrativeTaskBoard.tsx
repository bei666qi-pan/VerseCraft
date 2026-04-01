"use client";

import { useMemo, useState } from "react";
import type { ClueEntry } from "@/lib/domain/narrativeDomain";
import type { CodexEntry, GameTask } from "@/store/useGameStore";
import { resolveFloorTierLabel } from "@/lib/ui/displayNameResolvers";
import {
  buildTaskStageCardViewModel,
  computeTaskBoardPressureSummary,
  inferTaskStageRole,
  projectTaskBoardStageProjection,
  type TaskStageCardViewModel,
} from "@/lib/play/taskBoardUi";
import { getClientTaskBoardPressureV1Enabled, getClientTaskVisibilityPolicyV3Enabled } from "@/lib/rollout/versecraftClientRollout";
import { getTaskStatusLabel } from "@/lib/tasks/taskV2";

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

function roleShellClasses(
  role: TaskStageCardViewModel["role"],
  isOverlay: boolean,
  size: "hero" | "standard"
): { frame: string; accent: string; rolePill: string; roleLabel: string } {
  if (role === "mainline") {
    return {
      frame: isOverlay
        ? size === "hero"
          ? "border-2 border-amber-300/90 bg-gradient-to-br from-amber-50 via-white to-white shadow-[0_14px_40px_rgba(15,23,42,0.12)]"
          : "border border-amber-200/90 bg-gradient-to-br from-amber-50/90 via-white to-white"
        : size === "hero"
          ? "border-2 border-amber-400/70 bg-gradient-to-br from-amber-500/20 via-white/8 to-white/5 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]"
          : "border border-amber-400/45 bg-gradient-to-br from-amber-500/14 via-white/5 to-white/5",
      accent: isOverlay ? "from-amber-300/85 to-transparent" : "from-amber-400/70 to-transparent",
      rolePill: isOverlay ? "bg-amber-100 text-amber-950 ring-1 ring-amber-200/80" : "bg-amber-500/25 text-amber-50 ring-1 ring-amber-300/35",
      roleLabel: "主线",
    };
  }
  if (role === "opportunity") {
    return {
      frame: isOverlay
        ? "border border-cyan-200/90 bg-gradient-to-br from-cyan-50/80 via-white to-white"
        : "border border-cyan-400/35 bg-gradient-to-br from-cyan-500/12 via-white/5 to-white/5",
      accent: isOverlay ? "from-cyan-300/75 to-transparent" : "from-cyan-400/55 to-transparent",
      rolePill: isOverlay ? "bg-cyan-100 text-cyan-950 ring-1 ring-cyan-200/80" : "bg-cyan-500/20 text-cyan-50 ring-1 ring-cyan-300/30",
      roleLabel: "机会",
    };
  }
  return {
    frame: isOverlay
      ? "border border-indigo-200/85 bg-gradient-to-br from-indigo-50/70 via-white to-white"
      : "border border-indigo-400/30 bg-gradient-to-br from-indigo-500/12 via-white/5 to-white/5",
    accent: isOverlay ? "from-indigo-300/70 to-transparent" : "from-indigo-400/50 to-transparent",
    rolePill: isOverlay ? "bg-indigo-100 text-indigo-950 ring-1 ring-indigo-200/80" : "bg-indigo-500/20 text-indigo-50 ring-1 ring-indigo-300/30",
    roleLabel: "委托",
  };
}

export function PlayNarrativeTaskBoard({
  tasks,
  originium,
  journalClues: _journalClues, // 保留 API；舞台卡文案由投影层字段驱动，不在这里拼线索标题
  codex,
  highlightTaskIds,
  onClaimTask,
  density,
}: PlayNarrativeTaskBoardProps) {
  const [showMore, setShowMore] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const mode = density === "overlay" ? "light" : "dark";
  const showPressure = getClientTaskBoardPressureV1Enabled();

  const { board, cards } = useMemo(() => {
    const v3 = getClientTaskVisibilityPolicyV3Enabled();
    return projectTaskBoardStageProjection(tasks ?? [], v3, codex);
  }, [tasks, codex]);

  const {
    promises,
    clues,
    overflow,
    completed,
    failed,
    visibleCount,
    backgroundHiddenCount,
    mainline,
    commissions,
    opportunity,
  } = board;

  const highlightSet = useMemo(
    () => new Set((highlightTaskIds ?? []).filter((x): x is string => typeof x === "string" && x.trim().length > 0)),
    [highlightTaskIds]
  );

  const isOverlay = density === "overlay";
  const sectionTitle = isOverlay
    ? "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
    : "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400";
  const cardBase = isOverlay
    ? "relative rounded-xl border bg-white p-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
    : "relative rounded-xl border border-white/10 bg-white/5 p-3";

  const pressure = useMemo(() => {
    if (!showPressure) return null;
    return computeTaskBoardPressureSummary(tasks ?? [], { primary: mainline, promises });
  }, [showPressure, tasks, mainline, promises]);

  const pressureTone = (() => {
    if (!pressure) return "";
    if (pressure.tier === "critical") return isOverlay ? "border-rose-200 bg-rose-50 text-rose-800" : "border-rose-400/35 bg-rose-500/10 text-rose-100";
    if (pressure.tier === "high") return isOverlay ? "border-amber-200 bg-amber-50 text-amber-800" : "border-amber-400/35 bg-amber-500/10 text-amber-100";
    if (pressure.tier === "medium") return isOverlay ? "border-slate-200 bg-slate-50 text-slate-700" : "border-white/15 bg-white/10 text-slate-200";
    return isOverlay ? "border-slate-200/80 bg-white text-slate-600" : "border-white/10 bg-white/5 text-slate-300";
  })();

  const overflowCards = useMemo(
    () => overflow.map((t) => buildTaskStageCardViewModel(t, inferTaskStageRole(t), codex)),
    [overflow, codex]
  );
  const promiseCards = useMemo(
    () => promises.map((t) => buildTaskStageCardViewModel(t, inferTaskStageRole(t), codex)),
    [promises, codex]
  );
  const clueCards = useMemo(() => clues.map((t) => buildTaskStageCardViewModel(t, inferTaskStageRole(t), codex)), [clues, codex]);
  const closedCards = useMemo(
    () => [...completed, ...failed].map((t) => buildTaskStageCardViewModel(t, inferTaskStageRole(t), codex)),
    [completed, failed, codex]
  );

  function taskById(id: string): GameTask | undefined {
    return (tasks ?? []).find((t) => t.id === id);
  }

  function renderStageCard(vm: TaskStageCardViewModel, opts: { size: "hero" | "standard"; dimmed?: boolean }) {
    const t = taskById(vm.taskId);
    const size = opts.size;
    const dimmed = opts.dimmed ?? false;
    const shell = roleShellClasses(vm.role, isOverlay, size);
    const highlighted = highlightSet.has(vm.taskId);
    const ring = highlighted
      ? isOverlay
        ? "ring-2 ring-amber-200/70 shadow-[0_0_0_3px_rgba(251,191,36,0.10),0_10px_28px_rgba(15,23,42,0.10)]"
        : "ring-2 ring-amber-400/45 shadow-[0_0_0_2px_rgba(251,191,36,0.14)]"
      : "";
    const closedDim = dimmed ? (isOverlay ? "opacity-[0.72]" : "opacity-[0.62]") : "";
    const pad = size === "hero" ? "p-4 sm:p-5" : "p-3 sm:p-3.5";
    const titleCls =
      size === "hero"
        ? `line-clamp-2 text-base font-bold sm:text-lg ${isOverlay ? "text-slate-900" : "text-white"}`
        : `line-clamp-2 text-sm font-semibold ${isOverlay ? "text-slate-800" : "text-white"}`;

    const floorLine = t ? resolveFloorTierLabel(t.floorTier) : "";

    const labelMuted = isOverlay ? "text-slate-500" : "text-slate-400";
    const bodyMuted = isOverlay ? "text-slate-600" : "text-slate-300";
    const riskBox =
      vm.riskBand === "hot"
        ? isOverlay
          ? "border-rose-200/55 bg-rose-50/70 text-rose-900"
          : "border-rose-500/30 bg-rose-500/10 text-rose-100"
        : vm.riskBand === "uneasy"
          ? isOverlay
            ? "border-amber-200/60 bg-amber-50/75 text-amber-950"
            : "border-amber-400/35 bg-amber-500/12 text-amber-50"
          : isOverlay
            ? "border-slate-200/70 bg-slate-50/80 text-slate-800"
            : "border-white/15 bg-white/8 text-slate-100";

    return (
      <article key={vm.taskId} className={`${cardBase} ${shell.frame} ${ring} ${closedDim} ${pad} transition`}>
        <div className={`pointer-events-none absolute left-0 top-0 h-full w-[12px] bg-gradient-to-r ${shell.accent}`} />
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-px ${
            isOverlay ? "bg-gradient-to-r from-slate-200/70 via-white/50 to-slate-200/70" : "bg-white/10"
          }`}
        />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${shell.rolePill}`}>{shell.roleLabel}</span>
              {t ? (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle(t.status, mode)}`}>
                  {getTaskStatusLabel(t.status)}
                </span>
              ) : null}
            </div>
            <h4 className={titleCls}>{vm.title}</h4>
          </div>
        </div>

        <dl className={`mt-3 space-y-2 text-xs leading-snug sm:text-[13px] ${bodyMuted}`}>
          <div className="grid gap-0.5">
            <dt className={`text-[10px] font-semibold uppercase tracking-wider ${labelMuted}`}>谁给的</dt>
            <dd className="font-medium text-[13px] sm:text-sm">{vm.issuerLine}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className={`text-[10px] font-semibold uppercase tracking-wider ${labelMuted}`}>为何要紧</dt>
            <dd className="line-clamp-3">{vm.whyMatters}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className={`text-[10px] font-semibold uppercase tracking-wider ${labelMuted}`}>不做会怎样</dt>
            <dd className="line-clamp-3">{vm.ifNotDone}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className={`text-[10px] font-semibold uppercase tracking-wider ${labelMuted}`}>做成能得到</dt>
            <dd className="line-clamp-3">{vm.payoffLine}</dd>
          </div>
        </dl>

        <div className={`mt-3 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed sm:text-xs ${riskBox}`}>
          <span
            className={`font-semibold ${
              vm.riskBand === "hot"
                ? isOverlay
                  ? "text-rose-800"
                  : "text-rose-100"
                : vm.riskBand === "uneasy"
                  ? isOverlay
                    ? "text-amber-900"
                    : "text-amber-100"
                  : isOverlay
                    ? "text-slate-700"
                    : "text-slate-200"
            }`}
          >
            风险感 ·{" "}
          </span>
          <span
            className={
              vm.riskBand === "hot"
                ? isOverlay
                  ? "text-rose-900/90"
                  : "text-rose-50/95"
                : vm.riskBand === "uneasy"
                  ? isOverlay
                    ? "text-amber-950/90"
                    : "text-amber-50/95"
                  : isOverlay
                    ? "text-slate-800/95"
                    : "text-slate-100/95"
            }
          >
            {vm.riskSense}
          </span>
        </div>

        {floorLine ? (
          <p className={`mt-2 text-[10px] ${labelMuted}`}>
            地点层级：<span className="font-medium">{floorLine}</span>
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-end gap-2">
          {t && t.status === "available" && t.claimMode === "manual" ? (
            <button
              type="button"
              onClick={() => onClaimTask(vm.taskId)}
              className={
                isOverlay
                  ? "rounded-lg border border-indigo-200/80 bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                  : "rounded-lg border border-indigo-300/30 bg-indigo-500/15 px-3 py-1.5 text-[11px] font-semibold text-indigo-100 hover:bg-indigo-500/20"
              }
            >
              接取
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  if (visibleCount === 0) {
    return (
      <div
        className={
          isOverlay
            ? "rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-4 text-center text-xs text-slate-500"
            : "rounded-xl border border-white/10 bg-white/5 p-6 text-center text-xs text-slate-500"
        }
      >
        暂时没有要跟的事。多走走、多问问，可能会有人把麻烦交到你手里。
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className={sectionTitle}>行动舞台</p>
        <span
          className={
            isOverlay
              ? "rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
              : "inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200"
          }
        >
          原石 {originium}
        </span>
      </div>

      {pressure ? (
        <div className={`rounded-xl border px-3 py-2 text-[11px] ${pressureTone}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`font-semibold tracking-[0.18em] ${isOverlay ? "text-slate-500" : "text-slate-300"}`}>局势</div>
              <div className="mt-1 line-clamp-2">
                {pressure.tier === "critical"
                  ? `墙在收紧。${pressure.line}`
                  : pressure.tier === "high"
                    ? `别分心。${pressure.line}`
                    : pressure.tier === "medium"
                      ? `风向不稳。${pressure.line}`
                      : `暂时压住了。${pressure.line}`}
              </div>
            </div>
            <div className="shrink-0 space-y-1 text-right">
              <div className={`font-mono ${isOverlay ? "text-slate-500" : "text-slate-400"}`}>在跟 {pressure.signals.openCount}</div>
              {pressure.signals.riskCount > 0 ? (
                <div className={`font-mono ${isOverlay ? "text-slate-500" : "text-slate-400"}`}>反噬 {pressure.signals.riskCount}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 1. 置顶：主线（唯一） */}
      {cards.mainline ? (
        <section className="space-y-2" aria-label="主线">
          <div className="flex items-end justify-between gap-2">
            <p className={`${sectionTitle} !tracking-[0.22em]`}>现在最重要的事</p>
            <span className={`hidden text-[10px] sm:inline ${isOverlay ? "text-slate-400" : "text-slate-500"}`}>唯一置顶</span>
          </div>
          {renderStageCard(cards.mainline, { size: "hero" })}
          <p className={`text-[11px] leading-relaxed sm:max-w-prose ${isOverlay ? "text-slate-500" : "text-slate-400"}`}>
            先把这张卡推进一格。其它线会围绕你的选择重新排队。
          </p>
        </section>
      ) : null}

      {/* 2. 人物委托（最多两张） */}
      {cards.commissions.length > 0 ? (
        <section className="space-y-2" aria-label="人物委托">
          <p className={sectionTitle}>人物委托</p>
          <div className="grid gap-3 sm:grid-cols-1">{cards.commissions.map((vm) => renderStageCard(vm, { size: "standard" }))}</div>
        </section>
      ) : null}

      {/* 3. 机会事件（最多一张） */}
      {cards.opportunity ? (
        <section className="space-y-2" aria-label="机会事件">
          <p className={sectionTitle}>机会事件 · 窗口</p>
          {renderStageCard(cards.opportunity, { size: "standard" })}
          <p className={`text-[11px] leading-relaxed ${isOverlay ? "text-slate-500" : "text-slate-400"}`}>
            与委托不同：更像短时岔路——高收益往往伴随更高不确定性。
          </p>
        </section>
      ) : null}

      {promiseCards.length > 0 ? (
        <div>
          <p className={`mb-2 ${sectionTitle}`}>牵连与风险（会计息）</p>
          <div className="space-y-2">{promiseCards.map((vm) => renderStageCard(vm, { size: "standard" }))}</div>
        </div>
      ) : null}

      {clueCards.length > 0 ? (
        <div>
          <p className={`mb-2 ${sectionTitle}`}>线索影子（正在发酵）</p>
          <div className="space-y-2">{clueCards.map((vm) => renderStageCard(vm, { size: "standard" }))}</div>
        </div>
      ) : null}

      {overflowCards.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[11px] font-medium transition ${
              isOverlay
                ? "border-slate-200/80 bg-gradient-to-b from-slate-50 to-white text-slate-700 hover:bg-slate-100"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <span>更多在办（{overflowCards.length}）</span>
            <span className="text-slate-400">{showMore ? "收起" : "展开"}</span>
          </button>
          {showMore ? (
            <div className="space-y-2">{overflowCards.map((vm) => renderStageCard(vm, { size: "standard" }))}</div>
          ) : null}
        </div>
      ) : null}

      {backgroundHiddenCount > 0 ? (
        <p className={`text-[11px] ${isOverlay ? "text-slate-500" : "text-slate-400"}`}>
          另有 {backgroundHiddenCount} 条后台线索在发酵，未进入本轮行动板。
        </p>
      ) : null}

      {completed.length + failed.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[11px] font-medium transition ${
              isOverlay
                ? "border-slate-200/80 bg-gradient-to-b from-slate-50 to-white text-slate-700 hover:bg-slate-100"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <span>
              收起的记录：已完成 {completed.length} · 落空 {failed.length}
            </span>
            <span className="text-slate-400">{showClosed ? "收起" : "展开"}</span>
          </button>
          {showClosed ? (
            <div className="space-y-2 opacity-80">{closedCards.map((vm) => renderStageCard(vm, { size: "standard", dimmed: true }))}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
