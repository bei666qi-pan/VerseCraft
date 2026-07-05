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
  type TaskCompactRowViewModel,
  type TaskStageCardViewModel,
} from "@/lib/play/taskBoardUi";
import { getClientTaskBoardPressureV1Enabled, getClientTaskVisibilityPolicyV3Enabled } from "@/lib/rollout/versecraftClientRollout";
import { getTaskStatusLabel } from "@/lib/tasks/taskV2";

// 2026-07 重构说明：本组件此前同时维护 "overlay(浅色)/embedded(暗色玻璃)" 两套视觉分支，
// 但全仓库唯一两个调用方（PlayTaskPanel、MobileTaskPanel）实际只会传 density="overlay"，
// embedded 分支已确认零调用、纯死代码。任务面板走的是"纸质手记"这条既有阅读壳层视觉语言
// （见 mobileReading/theme.ts，供图鉴/角色/设置等十余个面板共用），本次收敛为单一视觉模式，
// 不再需要 density 参数，直接砍掉暗色分支，减少这个文件一半的样式分支体积。

function guidanceBadge(level: TaskStageCardViewModel["guidanceLevel"]): { label: string; cls: string } | null {
  if (level === "strong") {
    return { label: "指引明确", cls: "border-teal-200 bg-teal-50 text-teal-800" };
  }
  if (level === "light") {
    return { label: "靠自己摸索", cls: "border-slate-200 bg-slate-50 text-slate-500" };
  }
  return null;
}

function statusStyle(status: GameTask["status"]): string {
  if (status === "active") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "available") return "border-indigo-200 bg-indigo-50 text-indigo-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

export type PlayNarrativeTaskBoardProps = {
  tasks: GameTask[];
  originium: number;
  journalClues?: ClueEntry[];
  codex?: Record<string, CodexEntry>;
  highlightTaskIds?: string[];
  onClaimTask: (taskId: string) => void;
};

function roleShellClasses(
  role: TaskStageCardViewModel["role"],
  size: "hero" | "standard"
): { frame: string; accent: string; rolePill: string; roleLabel: string } {
  if (role === "mainline") {
    return {
      frame:
        size === "hero"
          ? "border-2 border-amber-300/90 bg-gradient-to-br from-amber-50 via-white to-white shadow-[0_14px_40px_rgba(15,23,42,0.12)]"
          : "border border-amber-200/90 bg-gradient-to-br from-amber-50/90 via-white to-white",
      accent: "from-amber-300/85 to-transparent",
      rolePill: "bg-amber-100 text-amber-950 ring-1 ring-amber-200/80",
      roleLabel: "主线",
    };
  }
  if (role === "opportunity") {
    return {
      frame: "border border-cyan-200/90 bg-gradient-to-br from-cyan-50/80 via-white to-white",
      accent: "from-cyan-300/75 to-transparent",
      rolePill: "bg-cyan-100 text-cyan-950 ring-1 ring-cyan-200/80",
      roleLabel: "机会",
    };
  }
  return {
    frame: "border border-indigo-200/85 bg-gradient-to-br from-indigo-50/70 via-white to-white",
    accent: "from-indigo-300/70 to-transparent",
    rolePill: "bg-indigo-100 text-indigo-950 ring-1 ring-indigo-200/80",
    roleLabel: "委托",
  };
}

const toggleButtonCls =
  "mb-2 flex w-full items-center justify-between rounded-lg border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white px-3 py-2 text-left text-[11px] font-medium text-slate-700 transition hover:bg-slate-100";

export function PlayNarrativeTaskBoard({
  tasks,
  originium,
  journalClues: _journalClues, // 保留 API；舞台卡文案由投影层字段驱动，不在这里拼线索标题
  codex,
  highlightTaskIds,
  onClaimTask,
}: PlayNarrativeTaskBoardProps) {
  const [showMore, setShowMore] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const showPressure = getClientTaskBoardPressureV1Enabled();

  const { board, cards, secondary } = useMemo(() => {
    const v3 = getClientTaskVisibilityPolicyV3Enabled();
    return projectTaskBoardStageProjection(tasks ?? [], v3, codex);
  }, [tasks, codex]);

  const { overflow, completed, failed, visibleCount, backgroundHiddenCount, mainline } = board;

  const highlightSet = useMemo(
    () => new Set((highlightTaskIds ?? []).filter((x): x is string => typeof x === "string" && x.trim().length > 0)),
    [highlightTaskIds]
  );

  const pressure = useMemo(() => {
    if (!showPressure) return null;
    return computeTaskBoardPressureSummary(tasks ?? [], { primary: mainline, promises: board.promises });
  }, [showPressure, tasks, mainline, board.promises]);

  const pressureTone = (() => {
    if (!pressure) return "";
    if (pressure.tier === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
    if (pressure.tier === "high") return "border-amber-200 bg-amber-50 text-amber-800";
    if (pressure.tier === "medium") return "border-slate-200 bg-slate-50 text-slate-700";
    return "border-slate-200/80 bg-white text-slate-600";
  })();

  const overflowCards = useMemo(
    () => overflow.map((t) => buildTaskStageCardViewModel(t, inferTaskStageRole(t), codex)),
    [overflow, codex]
  );
  const closedCards = useMemo(
    () => [...completed, ...failed].map((t) => buildTaskStageCardViewModel(t, inferTaskStageRole(t), codex)),
    [completed, failed, codex]
  );

  function taskById(id: string): GameTask | undefined {
    return (tasks ?? []).find((t) => t.id === id);
  }

  function renderStageCard(vm: TaskStageCardViewModel, opts: { size: "hero" | "standard"; dimmed?: boolean; showRolePill?: boolean }) {
    const t = taskById(vm.taskId);
    const size = opts.size;
    const dimmed = opts.dimmed ?? false;
    const showRolePill = opts.showRolePill ?? false;
    const shell = roleShellClasses(vm.role, size);
    const highlighted = highlightSet.has(vm.taskId);
    const ring = highlighted
      ? "ring-2 ring-amber-200/70 shadow-[0_0_0_3px_rgba(251,191,36,0.10),0_10px_28px_rgba(15,23,42,0.10)]"
      : "";
    const closedDim = dimmed ? "opacity-[0.72]" : "";
    const pad = size === "hero" ? "p-4 sm:p-5" : "p-3 sm:p-3.5";
    const titleCls = size === "hero" ? "line-clamp-2 text-base font-bold text-slate-900 sm:text-lg" : "line-clamp-2 text-sm font-semibold text-slate-800";

    const floorLine = t ? resolveFloorTierLabel(t.floorTier) : "";
    const riskBox =
      vm.riskBand === "hot"
        ? "border-rose-200/55 bg-rose-50/70 text-rose-900"
        : vm.riskBand === "uneasy"
          ? "border-amber-200/60 bg-amber-50/75 text-amber-950"
          : "border-slate-200/70 bg-slate-50/80 text-slate-800";

    return (
      <article
        key={vm.taskId}
        className={`relative rounded-xl border bg-white p-3 shadow-[0_1px_0_rgba(15,23,42,0.04)] ${shell.frame} ${ring} ${closedDim} ${pad} transition`}
      >
        <div className={`pointer-events-none absolute left-0 top-0 h-full w-[12px] bg-gradient-to-r ${shell.accent}`} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-slate-200/70 via-white/50 to-slate-200/70" />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {showRolePill ? <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${shell.rolePill}`}>{shell.roleLabel}</span> : null}
              {t ? (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle(t.status)}`}>{getTaskStatusLabel(t.status)}</span>
              ) : null}
              {(() => {
                const badge = guidanceBadge(vm.guidanceLevel);
                return badge ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span> : null;
              })()}
            </div>
            <h4 className={titleCls}>{vm.title}</h4>
          </div>
        </div>

        <dl className="mt-3 space-y-2 text-xs leading-snug text-slate-600 sm:text-[13px]">
          <div className="grid gap-0.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">谁给的</dt>
            <dd className="font-medium text-[13px] sm:text-sm">{vm.issuerLine}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">为何要紧</dt>
            <dd className="line-clamp-3">{vm.whyMatters}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">不做会怎样</dt>
            <dd className="line-clamp-3">{vm.ifNotDone}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">做成能得到</dt>
            <dd className="line-clamp-3">{vm.payoffLine}</dd>
          </div>
        </dl>

        <div className={`mt-3 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed sm:text-xs ${riskBox}`}>
          <span className={`font-semibold ${vm.riskBand === "hot" ? "text-rose-800" : vm.riskBand === "uneasy" ? "text-amber-900" : "text-slate-700"}`}>风险感 · </span>
          <span className={vm.riskBand === "hot" ? "text-rose-900/90" : vm.riskBand === "uneasy" ? "text-amber-950/90" : "text-slate-800/95"}>{vm.riskSense}</span>
        </div>

        {floorLine ? (
          <p className="mt-2 text-[10px] text-slate-500">
            地点层级：<span className="font-medium">{floorLine}</span>
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-end gap-2">
          {t && t.status === "available" && t.claimMode === "manual" ? (
            <button
              type="button"
              onClick={() => onClaimTask(vm.taskId)}
              className="rounded-lg border border-indigo-200/80 bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              接取
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  function renderCompactRow(row: TaskCompactRowViewModel, kind: "promise" | "clue") {
    const toneDot = row.tone === "hot" ? "bg-rose-400" : row.tone === "uneasy" ? "bg-amber-400" : "bg-slate-300";
    const highlighted = highlightSet.has(row.taskId);
    return (
      <div
        key={row.taskId}
        className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
          highlighted ? "border-amber-200 bg-amber-50/70 ring-1 ring-amber-200/70" : "border-slate-200/70 bg-white/70"
        }`}
      >
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${toneDot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-slate-700">{row.title}</span>
          <span className="text-slate-400"> · </span>
          <span className="text-slate-500">{row.oneLiner}</span>
        </div>
        <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-300">{kind === "promise" ? "牵连" : "线索"}</span>
      </div>
    );
  }

  if (visibleCount === 0) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-4 text-center text-xs text-slate-500">
        暂时没有要跟的事。多走走、多问问，可能会有人把麻烦交到你手里。
      </div>
    );
  }

  const hasSecondary = secondary.promises.length > 0 || secondary.clues.length > 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">行动舞台</p>
        <span className="rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">原石 {originium}</span>
      </div>

      {pressure ? (
        <div className={`rounded-xl border px-3 py-2 text-[11px] ${pressureTone}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold tracking-[0.18em] text-slate-500">局势</div>
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
              <div className="font-mono text-slate-500">在跟 {pressure.signals.openCount}</div>
              {pressure.signals.riskCount > 0 ? <div className="font-mono text-slate-500">反噬 {pressure.signals.riskCount}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 1. 置顶：主线（唯一） */}
      {cards.mainline ? (
        <section className="space-y-2" aria-label="主线">
          <div className="flex items-end justify-between gap-2">
            <p className="!tracking-[0.22em] text-[11px] font-semibold uppercase text-slate-500">现在最重要的事</p>
            <span className="hidden text-[10px] text-slate-400 sm:inline">唯一置顶</span>
          </div>
          {renderStageCard(cards.mainline, { size: "hero" })}
          <p className="text-[11px] leading-relaxed text-slate-500 sm:max-w-prose">先把这张卡推进一格。其它线会围绕你的选择重新排队。</p>
        </section>
      ) : null}

      {/* 2. 人物委托（最多两张） */}
      {cards.commissions.length > 0 ? (
        <section className="space-y-2" aria-label="人物委托">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">人物委托</p>
          <div className="grid gap-3 sm:grid-cols-1">{cards.commissions.map((vm) => renderStageCard(vm, { size: "standard" }))}</div>
        </section>
      ) : null}

      {/* 3. 机会事件（最多一张） */}
      {cards.opportunity ? (
        <section className="space-y-2" aria-label="机会事件">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">机会事件 · 窗口</p>
          {renderStageCard(cards.opportunity, { size: "standard" })}
          <p className="text-[11px] leading-relaxed text-slate-500">与委托不同：更像短时岔路——高收益往往伴随更高不确定性。</p>
        </section>
      ) : null}

      {/* 4. 牵连与线索：轻追踪，改为单行摘要而非整张卡，避免抢主视图 */}
      {hasSecondary ? (
        <section className="space-y-2" aria-label="牵连与线索">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">牵连与线索 · 会计息</p>
          <div className="space-y-1.5">
            {secondary.promises.map((row) => renderCompactRow(row, "promise"))}
            {secondary.clues.map((row) => renderCompactRow(row, "clue"))}
          </div>
        </section>
      ) : null}

      {overflowCards.length > 0 ? (
        <div>
          <button type="button" onClick={() => setShowMore((v) => !v)} className={toggleButtonCls}>
            <span>更多在办（{overflowCards.length}）</span>
            <span className="text-slate-400">{showMore ? "收起" : "展开"}</span>
          </button>
          {showMore ? <div className="space-y-2">{overflowCards.map((vm) => renderStageCard(vm, { size: "standard", showRolePill: true }))}</div> : null}
        </div>
      ) : null}

      {backgroundHiddenCount > 0 ? (
        <p className="text-[11px] text-slate-500">另有 {backgroundHiddenCount} 条后台线索在发酵，未进入本轮行动板。</p>
      ) : null}

      {completed.length + failed.length > 0 ? (
        <div>
          <button type="button" onClick={() => setShowClosed((v) => !v)} className={toggleButtonCls}>
            <span>
              收起的记录：已完成 {completed.length} · 落空 {failed.length}
            </span>
            <span className="text-slate-400">{showClosed ? "收起" : "展开"}</span>
          </button>
          {showClosed ? (
            <div className="space-y-2 opacity-80">{closedCards.map((vm) => renderStageCard(vm, { size: "standard", dimmed: true, showRolePill: true }))}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
