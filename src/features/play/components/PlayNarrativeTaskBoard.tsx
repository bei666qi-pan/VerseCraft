"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { MAX_ACTIVE_TASKS } from "@/lib/tasks/taskV2";
import { MobileReadingIcons } from "@/features/play/mobileReading/icons";
import { languageText } from "@/lib/i18n/gameDisplay";
import { useGameStore } from "@/store/useGameStore";

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
//
// 2026-07（三次修订）：参考原神/星穹铁道的任务面板——列表默认只给"标题 + 当前该做什么"
// 一行，其余全部收进点开详情，靠追踪/图标做视觉区分，而不是把说明书摊在列表上。此前每张
// 卡固定摊开五行 dt/dd + 风险框 + 地点，等于把详情页硬塞进列表页。现在默认只留标题行和
// "下一步"一行，点一下卡片才展开谁给的/为何要紧/不做会怎样/做成能得到/风险感/地点层级；
// 接取按钮是唯一强制的行动点，不折叠。
//
// 2026-07（四次修订，产品重构）：参考艾尔登法环（克制留白、去仪表盘化）与原神/星穹铁道
// （分类清晰、图标+追踪）两种开放世界任务系统的设计取向，"克制为主、结构为辅"重做本面板：
// 1) 展开态此前四段各自带前缀标签的说明文字（谁给的/为何要紧/不做会怎样/做成能得到）+ 一个
//    常驻风险框 + 单独一行地点，合计最多七个信息块——收敛为：一句合并后的氛围文案（不再加
//    "为何要紧 ·" 这类前缀标签）+ 结构化奖励标签行（图标化，不再拼句子）+ 仅在有风险感时才
//    出现的风险短标签 + 一行"来源 · 地点"。calm（平静）任务不再被迫渲染风险框，这是此前
//    信息冗余感的主要来源。
// 2) 头部改为图标+短标签（复用 MobileReadingIcons.Tasks/Originium），与图鉴/角色面板的
//    "图标+标题"、"图标+数值徽标"语言对齐，不再是本面板独有的纯文字大写标签。
// 3) "局势"从一个常驻的、带数字仪表（在跟 N / 反噬 N）的彩色面板，收敛为仅在压力等级
//    非 low 时才出现的一句无边框文字——不对玩家做仪表盘式汇报，压力更多应该通过卡片本身
//    的存在与风险标签被感知到，而不是一个额外的数字面板。
// 4) 区块命名精简："现在最重要的事"并入头部语境后移除（英雄卡本身的尺寸/边框已表达"这是
//    当前目标"，不需要重复用一句话说明）；"人物委托"→"委托"；"机会事件 · 窗口"→"机会 ·
//    限时"；"牵连与线索"合并为"其他动向"（线索改为一句聚合提示，不再逐条摊开占地方）；
//    "更多在办（N）"→"其余进行中（N）"；"收起的记录：已完成 N · 落空 N"→"已完成 N ·
//    落空 N"（"收起的记录"是这个折叠按钮本身已经在说的事，前缀是纯冗余）。

function guidanceBadge(level: TaskStageCardViewModel["guidanceLevel"], english: boolean): { label: string; cls: string } | null {
  if (level === "strong") {
    return { label: english ? "Clear lead" : "指引明确", cls: "border-vc-accent/30 bg-vc-accent/8 text-vc-accent" };
  }
  if (level === "light") {
    return { label: english ? "Find your way" : "靠自己摸索", cls: "border-vc-line text-vc-ink-faint" };
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
function closedStamp(status: GameTask["status"], english: boolean): { glyph: string; cls: string } | null {
  if (status === "completed") return { glyph: english ? "OK" : "成", cls: "border-vc-accent/60 text-vc-accent" };
  if (status === "failed") return { glyph: english ? "X" : "败", cls: "border-vc-seal/60 text-vc-seal" };
  return null;
}

export type PlayNarrativeTaskBoardProps = {
  tasks: GameTask[];
  originium: number;
  journalClues?: ClueEntry[];
  codex?: Record<string, CodexEntry>;
  highlightTaskIds?: string[];
  onClaimTask: (taskId: string) => void;
  /** 玩家是否从未打开过任务面板。true = 显示首次引导文案。 */
  taskPanelFirstOpen?: boolean;
  /** 玩家打开任务面板时调用，标记面板已查看。 */
  onMarkTaskPanelOpened?: () => void;
};

function roleShellClasses(
  role: TaskStageCardViewModel["role"],
  size: "hero" | "standard",
  english: boolean
): { frame: string; accent: string; rolePill: string; roleLabel: string } {
  if (role === "mainline") {
    return {
      frame:
        size === "hero"
          ? "border-2 border-vc-line-warm bg-vc-paper-bright shadow-[0_14px_32px_rgba(73,63,51,0.10)]"
          : "border border-vc-line-warm bg-vc-paper-bright",
      accent: "bg-vc-accent/55",
      rolePill: "border border-vc-line-warm bg-vc-paper-bright text-vc-ink",
      roleLabel: english ? "Main" : "主线",
    };
  }
  if (role === "opportunity") {
    return {
      frame: "border border-dashed border-vc-line bg-vc-paper-raised",
      accent: "bg-vc-accent/25",
      rolePill: "border border-vc-line bg-white/60 text-vc-ink-soft",
      roleLabel: english ? "Chance" : "机会",
    };
  }
  return {
    frame: "border border-vc-line bg-vc-paper-raised",
    accent: "bg-vc-ink-faint/35",
    rolePill: "border border-vc-line bg-white/60 text-vc-ink-soft",
    roleLabel: english ? "Request" : "委托",
  };
}

const toggleButtonCls =
  "mb-2 flex w-full items-center justify-between rounded-xl border border-vc-line bg-vc-paper-raised px-3.5 py-2.5 text-left text-[11px] font-medium text-vc-ink-soft transition hover:border-vc-line-warm hover:bg-white";

/** 分区小标题：菱形前缀 + 标签 + 收尾细线，与纸墨阅读壳层的分隔符母题一致。 */
function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[9px] leading-none text-vc-ink-faint" aria-hidden>
        ◆
      </span>
      <p className="shrink-0 text-[11px] font-semibold tracking-[0.14em] text-vc-ink-soft">{children}</p>
      <span className="h-px flex-1 bg-vc-line/60" aria-hidden />
    </div>
  );
}

/** 展开态的奖励+风险标签行：图标化短标签，取代此前的整句奖励文案与常驻风险框。 */
function ChipRow({ vm }: { vm: TaskStageCardViewModel }) {
  const items: Array<{ key: string; label: string; icon?: boolean; tone: "reward" | "risk" }> = [
    ...vm.rewardChips.map((chip, i) => ({
      key: `reward-${chip.kind}-${i}`,
      label: chip.label,
      icon: chip.kind === "originium",
      tone: "reward" as const,
    })),
    ...(vm.riskTag ? [{ key: "risk", label: vm.riskTag, tone: "risk" as const }] : []),
  ];
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span
          key={item.key}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            item.tone === "risk"
              ? vm.riskBand === "hot"
                ? "border-vc-seal/35 bg-vc-seal/8 text-vc-seal"
                : "border-vc-line-warm bg-vc-paper-bright text-vc-ink"
              : "border-vc-line bg-white/70 text-vc-ink-soft"
          }`}
        >
          {item.icon ? (
            <MobileReadingIcons.Originium className="h-3 w-3 shrink-0 text-vc-accent" strokeWidth={1.3} />
          ) : null}
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function PlayNarrativeTaskBoard({
  tasks,
  originium,
  journalClues: _journalClues, // 保留 API；舞台卡文案由投影层字段驱动，不在这里拼线索标题
  codex,
  highlightTaskIds,
  onClaimTask,
  taskPanelFirstOpen,
  onMarkTaskPanelOpened,
}: PlayNarrativeTaskBoardProps) {
  const language = useGameStore((state) => state.language);
  const isEnglish = language === "en-US";
  const [showMore, setShowMore] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const showPressure = getClientTaskBoardPressureV1Enabled();

  /** 首次打开时标记已查看 */
  const hasCalledOnMarkTaskPanelOpened = useRef(false);
  useEffect(() => {
    if (taskPanelFirstOpen && onMarkTaskPanelOpened && !hasCalledOnMarkTaskPanelOpened.current) {
      hasCalledOnMarkTaskPanelOpened.current = true;
      onMarkTaskPanelOpened();
    }
  }, [taskPanelFirstOpen, onMarkTaskPanelOpened]);

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

  const activeTaskCount = useMemo(
    () => (tasks ?? []).filter((t) => t.status === "active" || t.status === "available").length,
    [tasks]
  );

  const { overflow, completed, failed, visibleCount, backgroundHiddenCount } = board;

  const highlightSet = useMemo(
    () => new Set((highlightTaskIds ?? []).filter((x): x is string => typeof x === "string" && x.trim().length > 0)),
    [highlightTaskIds]
  );

  const pressure = useMemo(() => {
    if (!showPressure) return null;
    return computeTaskBoardPressureSummary(tasks ?? [], { primary: board.mainline, promises: board.promises });
  }, [showPressure, tasks, board.mainline, board.promises]);

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
    const shell = roleShellClasses(vm.role, size, isEnglish);
    const highlighted = highlightSet.has(vm.taskId);
    const ring = highlighted
      ? "ring-2 ring-vc-accent/30 shadow-[0_0_0_3px_rgba(47,116,106,0.12),0_10px_24px_rgba(73,63,51,0.10)]"
      : "";
    const closedDim = dimmed ? "opacity-[0.72]" : "";
    const expanded = expandedIds.has(vm.taskId);
    const titleCls = size === "hero" ? "line-clamp-2 text-base font-bold text-vc-ink sm:text-lg" : "line-clamp-2 text-sm font-semibold text-vc-ink";
    const headPad = size === "hero" ? "p-4 sm:p-5" : "p-3 sm:p-3.5";

    const floorLine = t ? resolveFloorTierLabel(t.floorTier) : "";
    const stamp = t ? closedStamp(t.status, isEnglish) : null;
    const guidance = guidanceBadge(vm.guidanceLevel, isEnglish);
    const canClaim = Boolean(t && t.status === "available" && t.claimMode === "manual");
    const sourceLine = [vm.issuerLine, floorLine].filter(Boolean).join(" · ");

    return (
      <article
        key={vm.taskId}
        className={`relative overflow-hidden border bg-white shadow-[0_1px_0_rgba(73,63,51,0.05)] ${size === "hero" ? "rounded-2xl" : "rounded-xl"} ${shell.frame} ${ring} ${closedDim} transition`}
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
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle(t.status)}`}>{isEnglish ? ({ active: "Active", available: "Available", completed: "Completed", failed: "Failed", hidden: "Hidden" } as const)[t.status] : getTaskStatusLabel(t.status)}</span>
              ) : null}
              <h4 className={titleCls}>{vm.title}</h4>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-vc-ink-soft sm:text-[13px]">
              <span className="font-semibold text-vc-accent">{isEnglish ? "Next · " : "下一步 · "}</span>
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
          <div className="space-y-2.5 border-t border-vc-line/70 px-4 pb-3.5 pt-2.5 text-[12px] leading-relaxed text-vc-ink-soft sm:px-5 sm:text-[13px]">
            {guidance ? (
              <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${guidance.cls}`}>{guidance.label}</span>
            ) : null}
            <p>{vm.flavorLine}</p>
            {/* 进度与期限行 */}
            {vm.progressLabel || vm.deadlineLabel ? (
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium text-vc-ink-soft">
                {vm.progressLabel ? <span className="flex items-center gap-1">📋 {vm.progressLabel}</span> : null}
                {vm.deadlineLabel ? (
                  <span className={`rounded-full border px-2 py-0.5 ${vm.deadlineLabel === "已超时" ? "border-vc-seal/35 bg-vc-seal/8 text-vc-seal" : "border-vc-line-warm bg-vc-paper-bright text-vc-ink-soft"}`}>
                    ⏳ {vm.deadlineLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
            <ChipRow vm={vm} />
            {sourceLine ? <p className="text-[10px] text-vc-ink-faint">{sourceLine}</p> : null}
          </div>
        ) : null}

        {canClaim ? (
          <div className={`flex items-center justify-end px-4 pb-3 pt-1 sm:px-5 ${expanded ? "border-t border-dashed border-vc-line/80 pt-2.5" : ""}`}>
            <button
              type="button"
              onClick={() => onClaimTask(vm.taskId)}
              className="rounded-lg border border-vc-accent/40 bg-vc-accent/12 px-4 py-1.5 text-[11px] font-bold tracking-wide text-vc-accent transition hover:border-vc-accent/60 hover:bg-vc-accent/20 active:scale-[0.97]"
            >
              {isEnglish ? "Accept" : "接取"}
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  function renderCompactRow(row: TaskCompactRowViewModel) {
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
        <span className="shrink-0 text-[9px] uppercase tracking-wide text-vc-ink-faint">{isEnglish ? "Link" : "牵连"}</span>
      </div>
    );
  }

  if (visibleCount === 0) {
    return (
      <div className="rounded-xl border border-vc-line bg-vc-paper-raised p-4 text-center text-xs leading-relaxed text-vc-ink-soft">
        {taskPanelFirstOpen
          ? languageText(language, "任务会在叙事推进中自然出现，你已经在前往第一件事的路上——先把手头的事做起来，答案在路上。", "Tasks emerge through the story. Begin with what is in front of you.")
          : languageText(language, "当前没有活跃任务。与 NPC 交谈、探索楼层会带来新的目标。", "No active tasks. Talk to NPCs or explore to uncover new goals.")}
      </div>
    );
  }

  const hasSecondary = secondary.promises.length > 0 || secondary.clues.length > 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-vc-line-warm bg-vc-paper-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <MobileReadingIcons.Tasks className="h-4 w-4 text-vc-accent" strokeWidth={1.4} />
          </span>
          <p className="text-[14px] font-bold leading-none tracking-[0.06em] text-vc-ink">{isEnglish ? "Current objectives" : "当前目标"}</p>
        </div>
        <div className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-vc-line-warm bg-vc-paper-bright px-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <MobileReadingIcons.Originium className="h-3.5 w-3.5 shrink-0 text-vc-accent" strokeWidth={1.25} />
          <span className="text-[11px] font-semibold leading-none text-vc-ink">{originium}</span>
        </div>
      </div>

      {/* 活跃上限进度条 */}
      <div className="flex items-center gap-2 text-[10px] text-vc-ink-soft">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-vc-line/50">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              activeTaskCount >= MAX_ACTIVE_TASKS ? "bg-vc-seal" : "bg-vc-accent/50"
            }`}
            style={{ width: `${Math.min(100, (activeTaskCount / MAX_ACTIVE_TASKS) * 100)}%` }}
          />
        </div>
        <span className={`shrink-0 font-medium ${activeTaskCount >= MAX_ACTIVE_TASKS ? "text-vc-seal" : ""}`}>
          {activeTaskCount}/{MAX_ACTIVE_TASKS}
        </span>
      </div>

      {pressure && pressure.tier !== "low" ? (
        <p className={`text-[11px] leading-relaxed ${pressure.tier === "critical" ? "font-semibold text-vc-seal" : "text-vc-ink-soft"}`}>
          {isEnglish ? (pressure.tier === "critical" ? "The walls tighten — " : pressure.tier === "high" ? "Stay focused — " : "The air shifts — ") : (pressure.tier === "critical" ? "墙在收紧——" : pressure.tier === "high" ? "别分心——" : "风向不稳——")}
          {pressure.line}
        </p>
      ) : null}

      {/* 1. 置顶：主线（唯一）。卡片本身的尺寸与描边已表达"这是当前目标"，不再重复加一句说明。 */}
      {cards.mainline ? renderStageCard(cards.mainline, { size: "hero" }) : null}

      {/* 2. 人物委托（最多两张） */}
      {cards.commissions.length > 0 ? (
        <section className="space-y-2.5" aria-label={isEnglish ? "Requests" : "委托"}>
          <SectionLabel>{isEnglish ? "REQUESTS" : "委托"}</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-1">{cards.commissions.map((vm) => renderStageCard(vm, { size: "standard" }))}</div>
        </section>
      ) : null}

      {/* 3. 机会事件（最多一张） */}
      {cards.opportunity ? (
        <section className="space-y-2.5" aria-label={isEnglish ? "Timed chance" : "机会"}>
          <SectionLabel>{isEnglish ? "CHANCE · TIMED" : "机会 · 限时"}</SectionLabel>
          {renderStageCard(cards.opportunity, { size: "standard" })}
        </section>
      ) : null}

      {/* 4. 其他动向：牵连（轻追踪）+ 线索聚合为一句提示，不再逐条摊开占版面 */}
      {hasSecondary ? (
        <section className="space-y-2.5" aria-label={isEnglish ? "Other leads" : "其他动向"}>
          <SectionLabel>{isEnglish ? "OTHER LEADS" : "其他动向"}</SectionLabel>
          <div className="space-y-1.5">{secondary.promises.map((row) => renderCompactRow(row))}</div>
          {secondary.clues.length > 0 ? (
            <p className="text-[11px] text-vc-ink-faint">{isEnglish ? `${secondary.clues.length} more clues remain unresolved.` : `多留意：另有 ${secondary.clues.length} 条线索尚未挑明。`}</p>
          ) : null}
        </section>
      ) : null}

      {overflowCards.length > 0 ? (
        <div>
          <button type="button" onClick={() => setShowMore((v) => !v)} className={toggleButtonCls}>
            <span>{isEnglish ? `More active (${overflowCards.length})` : `其余进行中（${overflowCards.length}）`}</span>
            <span className="text-vc-ink-faint">{isEnglish ? (showMore ? "Collapse" : "Expand") : (showMore ? "收起" : "展开")}</span>
          </button>
          {showMore ? <div className="space-y-2">{overflowCards.map((vm) => renderStageCard(vm, { size: "standard", showRolePill: true }))}</div> : null}
        </div>
      ) : null}

      {backgroundHiddenCount > 0 ? (
        <p className="text-[11px] text-vc-ink-faint">{isEnglish ? `${backgroundHiddenCount} matters are still developing out of sight.` : `还有 ${backgroundHiddenCount} 件事在暗处发酵，眼下还摸不着，多留意周围。`}</p>
      ) : null}

      {completed.length + failed.length > 0 ? (
        <div>
          <button type="button" onClick={() => setShowClosed((v) => !v)} className={toggleButtonCls}>
            <span>
              {isEnglish ? `Completed ${completed.length} · Failed ${failed.length}` : `已完成 ${completed.length} · 落空 ${failed.length}`}
            </span>
            <span className="text-vc-ink-faint">{isEnglish ? (showClosed ? "Collapse" : "Expand") : (showClosed ? "收起" : "展开")}</span>
          </button>
          {showClosed ? (
            <div className="space-y-2 opacity-80">{closedCards.map((vm) => renderStageCard(vm, { size: "standard", dimmed: true, showRolePill: true }))}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
