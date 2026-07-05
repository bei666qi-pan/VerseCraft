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
// （见 mobileReading/theme.ts、globals.css 的 vc-* token，供图鉴/角色/设置等十余个面板共用），
// 本次收敛为单一视觉模式，不再需要 density 参数，直接砍掉暗色分支。
//
// 2026-07（二次修订）：此前的重写虽然精简了信息密度，但配色仍是 amber/cyan/indigo/rose/emerald/slate
// 这套通用 Tailwind 调色板——跟图鉴、角色、设置等姊妹面板实际使用的暖纸+墨青（vc-ink/vc-paper/vc-accent/
// vc-seal）完全是两套语言，任务面板打开时像一个套壳的后台管理面板。这次统一改用 globals.css 里已注册的
// vc-* 语义色：不同"角色/状态"不再各配一种高饱和色，只保留 vc-accent（在办/教官式强调）与 vc-seal（危险/
// 失败，globals.css 原注释即"朱砂：危险、死亡、警示"）两个语义色，其余一律回落到墨青/纸色的中性层级，
// 靠字重、边框、卡片层级做区分，而不是靠一整条彩虹。

function guidanceBadge(level: TaskStageCardViewModel["guidanceLevel"]): { label: string; cls: string } | null {
  if (level === "strong") {
    return { label: "指引明确", cls: "border-vc-accent/30 bg-vc-accent/8 text-vc-accent" };
  }
  if (level === "light") {
    return { label: "靠自己摸索", cls: "border-vc-line text-vc-ink-faint" };
  }
  return null;
}

function statusStyle(status: GameTask["status"]): string {
  if (status === "active") return "border-vc-accent/35 bg-vc-accent/10 text-vc-ink";
  if (status === "completed") return "border-vc-line text-vc-ink-faint";
  if (status === "available") return "border-vc-line-warm bg-vc-paper-bright text-vc-ink-soft";
  return "border-vc-seal/35 bg-vc-seal/10 text-vc-seal";
}

/**
 * 已完成/落空用旋转印章代替文字徽章——复用结算页"殁"字死亡印章的同一视觉语言
 * （-rotate-6 圆形描边+单字），比一条彩色 pill 更像纸质记录本上盖的戳，
 * 也顺带把"这条已经有定论"和"这条还在跟"从视觉上分得更开。
 */
function closedStamp(status: GameTask["status"]): { glyph: string; cls: string } | null {
  if (status === "completed") return { glyph: "成", cls: "border-vc-accent/60 text-vc-accent" };
  if (status === "failed") return { glyph: "败", cls: "border-vc-seal/60 text-vc-seal" };
  return null;
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
          ? "border-2 border-vc-line-warm bg-vc-paper-bright shadow-[0_14px_32px_rgba(73,63,51,0.10)]"
          : "border border-vc-line-warm bg-vc-paper-bright",
      accent: "bg-vc-accent/55",
      rolePill: "border border-vc-line-warm bg-vc-paper-bright text-vc-ink",
      roleLabel: "主线",
    };
  }
  if (role === "opportunity") {
    return {
      frame: "border border-dashed border-vc-line bg-vc-paper-raised",
      accent: "bg-vc-accent/25",
      rolePill: "border border-vc-line bg-white/60 text-vc-ink-soft",
      roleLabel: "机会",
    };
  }
  return {
    frame: "border border-vc-line bg-vc-paper-raised",
    accent: "bg-vc-ink-faint/35",
    rolePill: "border border-vc-line bg-white/60 text-vc-ink-soft",
    roleLabel: "委托",
  };
}

const toggleButtonCls =
  "mb-2 flex w-full items-center justify-between rounded-lg border border-vc-line bg-vc-paper-raised px-3 py-2 text-left text-[11px] font-medium text-vc-ink-soft transition hover:bg-white";

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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const showPressure = getClientTaskBoardPressureV1Enabled();

  function toggleExpanded(taskId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

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
    if (pressure.tier === "critical") return "border-vc-seal/35 bg-vc-seal/8 text-vc-ink";
    if (pressure.tier === "high") return "border-vc-line-warm bg-vc-paper-bright text-vc-ink";
    if (pressure.tier === "medium") return "border-vc-line bg-vc-paper-raised text-vc-ink-soft";
    return "border-vc-line bg-white/60 text-vc-ink-soft";
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

  /**
   * 2026-07（三次修订）：参考原神/星穹铁道的任务面板——列表默认只给"标题 + 当前该做什么"
   * 一行，其余全部收进点开详情，靠追踪/图标做视觉区分，而不是把说明书摊在列表上。此前每张
   * 卡固定摊开五行 dt/dd + 风险框 + 地点，等于把详情页硬塞进列表页。现在默认只留标题行和
   * "下一步"一行，点一下卡片才展开谁给的/为何要紧/不做会怎样/做成能得到/风险感/地点层级；
   * 接取按钮是唯一强制的行动点，不折叠。
   */
  function renderStageCard(vm: TaskStageCardViewModel, opts: { size: "hero" | "standard"; dimmed?: boolean; showRolePill?: boolean }) {
    const t = taskById(vm.taskId);
    const size = opts.size;
    const dimmed = opts.dimmed ?? false;
    const showRolePill = opts.showRolePill ?? false;
    const shell = roleShellClasses(vm.role, size);
    const highlighted = highlightSet.has(vm.taskId);
    const ring = highlighted
      ? "ring-2 ring-vc-accent/30 shadow-[0_0_0_3px_rgba(47,116,106,0.12),0_10px_24px_rgba(73,63,51,0.10)]"
      : "";
    const closedDim = dimmed ? "opacity-[0.72]" : "";
    const expanded = expandedIds.has(vm.taskId);
    const titleCls = size === "hero" ? "line-clamp-2 text-base font-bold text-vc-ink sm:text-lg" : "line-clamp-2 text-sm font-semibold text-vc-ink";
    const headPad = size === "hero" ? "p-4 sm:p-5" : "p-3 sm:p-3.5";

    const floorLine = t ? resolveFloorTierLabel(t.floorTier) : "";
    const riskBox =
      vm.riskBand === "hot"
        ? "border-vc-seal/30 bg-vc-seal/8 text-vc-ink"
        : vm.riskBand === "uneasy"
          ? "border-vc-line-warm bg-vc-paper-bright text-vc-ink"
          : "border-vc-line bg-vc-paper-raised text-vc-ink-soft";
    const stamp = t ? closedStamp(t.status) : null;
    const guidance = guidanceBadge(vm.guidanceLevel);
    const canClaim = Boolean(t && t.status === "available" && t.claimMode === "manual");

    return (
      <article
        key={vm.taskId}
        className={`relative overflow-hidden rounded-xl border bg-white shadow-[0_1px_0_rgba(73,63,51,0.05)] ${shell.frame} ${ring} ${closedDim} transition`}
      >
        <div className={`pointer-events-none absolute left-0 top-0 h-full w-[6px] ${shell.accent}`} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-vc-line/60" />

        <button
          type="button"
          onClick={() => toggleExpanded(vm.taskId)}
          aria-expanded={expanded}
          className={`flex w-full items-start gap-2.5 pl-[calc(0.75rem+6px)] text-left ${headPad}`}
        >
          {stamp ? (
            <span
              aria-hidden
              className={`vc-reading-serif inline-flex h-7 w-7 shrink-0 -rotate-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${stamp.cls}`}
            >
              {stamp.glyph}
            </span>
          ) : vm.riskBand === "hot" ? (
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vc-seal" />
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {showRolePill ? <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${shell.rolePill}`}>{shell.roleLabel}</span> : null}
              {t && t.status !== "completed" && t.status !== "failed" ? (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle(t.status)}`}>{getTaskStatusLabel(t.status)}</span>
              ) : null}
              <h4 className={titleCls}>{vm.title}</h4>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-vc-ink-soft sm:text-[13px]">
              <span className="font-semibold text-vc-accent">下一步 · </span>
              {vm.nextStep}
            </p>
          </div>

          <span
            aria-hidden
            className={`mt-1 shrink-0 text-[11px] text-vc-ink-faint transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          >
            ▸
          </span>
        </button>

        {expanded ? (
          <div className="space-y-2.5 border-t border-dashed border-vc-line/80 px-4 pb-3.5 pt-3 text-[12px] leading-relaxed text-vc-ink-soft sm:px-5 sm:text-[13px]">
            {guidance ? (
              <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${guidance.cls}`}>{guidance.label}</span>
            ) : null}
            <p><span className="font-semibold text-vc-ink-faint">谁给的 · </span>{vm.issuerLine}</p>
            <p><span className="font-semibold text-vc-ink-faint">为何要紧 · </span>{vm.whyMatters}</p>
            <p><span className="font-semibold text-vc-ink-faint">不做会怎样 · </span>{vm.ifNotDone}</p>
            <p><span className="font-semibold text-vc-ink-faint">做成能得到 · </span>{vm.payoffLine}</p>
            <div className={`rounded-lg border px-2.5 py-2 ${riskBox}`}>
              <span className={`font-semibold ${vm.riskBand === "hot" ? "text-vc-seal" : "text-vc-ink"}`}>风险感 · </span>
              <span className={vm.riskBand === "hot" ? "text-vc-seal/90" : "text-vc-ink-soft"}>{vm.riskSense}</span>
            </div>
            {floorLine ? (
              <p className="text-[10px] text-vc-ink-faint">
                地点层级：<span className="font-medium text-vc-ink-soft">{floorLine}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {canClaim ? (
          <div className={`flex items-center justify-end px-4 pb-3 pt-1 sm:px-5 ${expanded ? "border-t border-dashed border-vc-line/80 pt-2.5" : ""}`}>
            <button
              type="button"
              onClick={() => onClaimTask(vm.taskId)}
              className="rounded-lg border border-vc-accent/30 bg-vc-accent/10 px-3 py-1.5 text-[11px] font-semibold text-vc-accent transition hover:bg-vc-accent/15"
            >
              接取
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  function renderCompactRow(row: TaskCompactRowViewModel, kind: "promise" | "clue") {
    const toneDot = row.tone === "hot" ? "bg-vc-seal" : row.tone === "uneasy" ? "bg-vc-ink-soft" : "bg-vc-ink-faint";
    const highlighted = highlightSet.has(row.taskId);
    return (
      <div
        key={row.taskId}
        className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
          highlighted ? "border-vc-accent/30 bg-vc-accent/8 ring-1 ring-vc-accent/20" : "border-vc-line bg-white/60"
        }`}
      >
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${toneDot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-vc-ink">{row.title}</span>
          <span className="text-vc-ink-faint"> · </span>
          <span className="text-vc-ink-soft">{row.oneLiner}</span>
        </div>
        <span className="shrink-0 text-[9px] uppercase tracking-wide text-vc-ink-faint">{kind === "promise" ? "牵连" : "线索"}</span>
      </div>
    );
  }

  if (visibleCount === 0) {
    return (
      <div className="rounded-xl border border-vc-line bg-vc-paper-raised p-4 text-center text-xs text-vc-ink-soft">
        暂时没有要跟的事。多走走、多问问，可能会有人把麻烦交到你手里。
      </div>
    );
  }

  const hasSecondary = secondary.promises.length > 0 || secondary.clues.length > 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-vc-ink-faint">行动舞台</p>
        <span className="rounded-full border border-vc-line-warm bg-vc-paper-bright px-2.5 py-1 text-[11px] font-semibold text-vc-ink">原石 {originium}</span>
      </div>

      {pressure ? (
        <div className={`rounded-xl border px-3 py-2 text-[11px] ${pressureTone}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold tracking-[0.18em] text-vc-ink-faint">局势</div>
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
              <div className="font-mono text-vc-ink-soft">在跟 {pressure.signals.openCount}</div>
              {pressure.signals.riskCount > 0 ? <div className="font-mono text-vc-ink-soft">反噬 {pressure.signals.riskCount}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 1. 置顶：主线（唯一） */}
      {cards.mainline ? (
        <section className="space-y-2" aria-label="主线">
          <div className="flex items-end justify-between gap-2">
            <p className="!tracking-[0.22em] text-[11px] font-semibold uppercase text-vc-ink-faint">现在最重要的事</p>
            <span className="hidden text-[10px] text-vc-ink-faint sm:inline">唯一置顶</span>
          </div>
          {renderStageCard(cards.mainline, { size: "hero" })}
          <p className="text-[11px] leading-relaxed text-vc-ink-faint sm:max-w-prose">先把这张卡推进一格。其它线会围绕你的选择重新排队。</p>
        </section>
      ) : null}

      {/* 2. 人物委托（最多两张） */}
      {cards.commissions.length > 0 ? (
        <section className="space-y-2" aria-label="人物委托">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-vc-ink-faint">人物委托</p>
          <div className="grid gap-3 sm:grid-cols-1">{cards.commissions.map((vm) => renderStageCard(vm, { size: "standard" }))}</div>
        </section>
      ) : null}

      {/* 3. 机会事件（最多一张） */}
      {cards.opportunity ? (
        <section className="space-y-2" aria-label="机会事件">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-vc-ink-faint">机会事件 · 窗口</p>
          {renderStageCard(cards.opportunity, { size: "standard" })}
          <p className="text-[11px] leading-relaxed text-vc-ink-faint">与委托不同：更像短时岔路——高收益往往伴随更高不确定性。</p>
        </section>
      ) : null}

      {/* 4. 牵连与线索：轻追踪，改为单行摘要而非整张卡，避免抢主视图 */}
      {hasSecondary ? (
        <section className="space-y-2" aria-label="牵连与线索">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-vc-ink-faint">牵连与线索</p>
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
            <span className="text-vc-ink-faint">{showMore ? "收起" : "展开"}</span>
          </button>
          {showMore ? <div className="space-y-2">{overflowCards.map((vm) => renderStageCard(vm, { size: "standard", showRolePill: true }))}</div> : null}
        </div>
      ) : null}

      {backgroundHiddenCount > 0 ? (
        <p className="text-[11px] text-vc-ink-faint">还有 {backgroundHiddenCount} 件事在暗处发酵，眼下还摸不着，多留意周围。</p>
      ) : null}

      {completed.length + failed.length > 0 ? (
        <div>
          <button type="button" onClick={() => setShowClosed((v) => !v)} className={toggleButtonCls}>
            <span>
              收起的记录：已完成 {completed.length} · 落空 {failed.length}
            </span>
            <span className="text-vc-ink-faint">{showClosed ? "收起" : "展开"}</span>
          </button>
          {showClosed ? (
            <div className="space-y-2 opacity-80">{closedCards.map((vm) => renderStageCard(vm, { size: "standard", dimmed: true, showRolePill: true }))}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
