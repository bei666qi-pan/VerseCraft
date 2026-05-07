import type { MemorySpineEntry } from "@/lib/memorySpine/types";
import { toChineseChapterOrder } from "@/lib/chapters/title";
import {
  selectChapterMustEchoEntries,
  selectChapterRecapMemoryEntries,
  selectOpenChapterThreads,
} from "@/lib/memorySpine/selectors";
import type { DirectorSignals } from "./signals";
import type {
  ChapterCloseDecision,
  ChapterDirectorState,
  ChapterPhase,
  DirectorPlan,
  StoryDirectorState,
} from "./types";

type MemoryKind = MemorySpineEntry["kind"];

const THREAD_KINDS = new Set<MemoryKind>([
  "promise",
  "debt",
  "relationship_shift",
  "secret_fragment",
  "route_hint",
  "danger_hint",
  "task_residue",
  "hook",
]);

const ECHO_KINDS = new Set<MemoryKind>([
  "promise",
  "debt",
  "relationship_shift",
  "danger_hint",
  "hook",
]);

const REVEAL_KINDS = new Set<MemoryKind>(["hook", "secret_fragment"]);

function clampText(value: unknown, max: number, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.length <= max ? text : text.slice(0, max);
}

function uniq(xs: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs ?? []) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function getMemoryEntryId(entry: MemorySpineEntry): string {
  return clampText(entry.id, 100) || clampText((entry as { mergeKey?: unknown }).mergeKey, 100);
}

function collectThreadIds(entries: MemorySpineEntry[], status: "open" | "resolved", cap: number): string[] {
  const ids: string[] = [];
  for (const entry of entries ?? []) {
    if (!entry || !THREAD_KINDS.has(entry.kind)) continue;
    if (status === "open" && entry.status !== "active") continue;
    if (status === "resolved" && entry.status !== "resolved" && entry.status !== "consumed") continue;
    const id = getMemoryEntryId(entry);
    if (id) ids.push(id);
  }
  return uniq(ids, cap);
}

function collectMustEchoMemoryIds(entries: MemorySpineEntry[]): string[] {
  const ranked = (entries ?? [])
    .filter((entry) => {
      if (!entry || entry.status !== "active" || !ECHO_KINDS.has(entry.kind)) return false;
      return Number(entry.salience ?? 0) >= 0.5 || entry.kind === "relationship_shift";
    })
    .sort((a, b) => Number(b.salience ?? 0) - Number(a.salience ?? 0))
    .map(getMemoryEntryId)
    .filter(Boolean);
  return uniq(ranked, 6);
}

function collectRevealCandidateIds(entries: MemorySpineEntry[]): string[] {
  const ranked = (entries ?? [])
    .filter((entry) => {
      if (!entry || entry.status !== "active" || !REVEAL_KINDS.has(entry.kind)) return false;
      return Number(entry.salience ?? 0) >= 0.45 && Number(entry.confidence ?? 0) >= 0.45;
    })
    .sort((a, b) => Number(b.salience ?? 0) - Number(a.salience ?? 0))
    .map(getMemoryEntryId)
    .filter(Boolean);
  return uniq(ranked, 4);
}

function collectForbiddenRevealIds(entries: MemorySpineEntry[]): string[] {
  const ids = (entries ?? [])
    .filter((entry) => entry && entry.status === "active" && entry.kind === "secret_fragment")
    .map(getMemoryEntryId)
    .filter(Boolean);
  return uniq(ids, 8);
}

function matchesChapter(entry: MemorySpineEntry, chapter: ChapterDirectorState): boolean {
  if (entry.chapterId && entry.chapterId === chapter.currentChapterId) return true;
  if (typeof entry.chapterOrder === "number" && entry.chapterOrder === chapter.chapterOrder) return true;
  return !entry.chapterId && typeof entry.chapterOrder !== "number";
}

function hasConflictSignal(signals: DirectorSignals): boolean {
  if (signals.loreConflict === true) return true;
  return (signals.notes ?? []).some((note) =>
    /lore_conflict|forbidden_reveal|dm_only_leak|schema_invalid|hallucination/i.test(String(note ?? ""))
  );
}

function buildCloseRecapCandidate(args: {
  chapter: ChapterDirectorState;
  recapEntries: MemorySpineEntry[];
  hasFirstChapterIntervention: boolean;
  hasNewHook: boolean;
}): string {
  const fragments = args.recapEntries
    .map((entry) => clampText(entry.summary, 90))
    .filter(Boolean)
    .slice(0, 3);
  if (fragments.length > 0) {
    return clampText(`${args.chapter.chapterTitle}: ${fragments.join("；")}`, 360);
  }
  if (args.hasFirstChapterIntervention) {
    return clampText(`${args.chapter.chapterTitle}: 玩家已经完成第一次明确介入，新的回响正在形成。`, 360);
  }
  if (args.hasNewHook) {
    return clampText(`${args.chapter.chapterTitle}: 本章的小问题暂时收束，新的钩子留向下一章。`, 360);
  }
  return clampText(`${args.chapter.chapterTitle}: 本章仍在等待一次可读的收束。`, 360);
}

function nextChapterTitleCandidate(chapter: ChapterDirectorState, shouldClose: boolean): string | null {
  if (!shouldClose) return null;
  if (chapter.nextChapterSeed?.title) return chapter.nextChapterSeed.title;
  if (chapter.closeCandidate?.nextChapterTitleCandidate) return chapter.closeCandidate.nextChapterTitleCandidate;
  return `第${toChineseChapterOrder(chapter.chapterOrder + 1)}章`;
}

export function evaluateChapterCloseDecision(args: {
  chapter: ChapterDirectorState;
  memoryEntries: MemorySpineEntry[];
  directorPlan: DirectorPlan;
  signals: DirectorSignals;
  nowTurn: number;
}): ChapterCloseDecision {
  const turnsInChapter = Math.max(0, Math.trunc(args.nowTurn) - args.chapter.startedTurn);
  const memoryState = { v: 1 as const, entries: args.memoryEntries ?? [] };
  const chapterSelector = {
    chapterId: args.chapter.currentChapterId,
    chapterOrder: args.chapter.chapterOrder,
  };
  const recapEntries = selectChapterRecapMemoryEntries(memoryState, { ...chapterSelector, maxItems: 6 });
  const mustEchoEntries = selectChapterMustEchoEntries(memoryState, { ...chapterSelector, maxItems: 6 });
  const openThreads = selectOpenChapterThreads(memoryState, { ...chapterSelector, maxItems: 12 });
  const resolvedThreads = (args.memoryEntries ?? []).filter(
    (entry) =>
      entry &&
      matchesChapter(entry, args.chapter) &&
      THREAD_KINDS.has(entry.kind) &&
      (entry.status === "resolved" || entry.status === "consumed")
  );

  const hasResolvedSmallQuestion =
    resolvedThreads.some((entry) => entry.kind === "promise" || entry.kind === "task_residue" || entry.kind === "debt") ||
    (args.chapter.resolvedThreadIds ?? []).length > 0 ||
    args.signals.terminalTaskDelta > 0 ||
    (args.signals.progressed && args.signals.effectiveProgressScore >= 28);
  const hasNewHook =
    openThreads.some((entry) => entry.kind === "hook" || entry.kind === "secret_fragment" || entry.kind === "danger_hint") ||
    mustEchoEntries.some((entry) => entry.kind === "hook" || entry.kind === "secret_fragment" || entry.kind === "danger_hint") ||
    args.signals.hooksReady === true;
  const actualChoiceEcho =
    (args.chapter.keyChoiceIds ?? []).length > 0 &&
    ((args.chapter.echoedChoiceIds ?? []).length > 0 ||
      recapEntries.some((entry) => entry.chapterRole === "echo" || entry.kind === "relationship_shift") ||
      args.signals.relationshipUpdateCount > 0);
  const hasFirstChapterIntervention =
    args.chapter.chapterOrder === 1 &&
    ((args.chapter.keyChoiceIds ?? []).length > 0 ||
      args.signals.moved ||
      args.signals.taskUpdateCount > 0 ||
      args.signals.terminalTaskDelta > 0 ||
      args.signals.relationshipUpdateCount > 0 ||
      args.signals.mainThreatUpdateCount > 0);
  const hasPlayerChoiceEcho = actualChoiceEcho || hasFirstChapterIntervention;
  const hasReadablePause =
    args.directorPlan.beatMode === "quiet" ||
    args.directorPlan.beatMode === "aftershock" ||
    (args.signals.progressed &&
      !args.signals.stalled &&
      !args.signals.highPressure &&
      !args.signals.threatHot &&
      !args.signals.nearPeak &&
      args.directorPlan.beatMode !== "peak" &&
      args.directorPlan.beatMode !== "collision" &&
      args.directorPlan.beatMode !== "countdown");
  const hasNoLoreConflict = !hasConflictSignal(args.signals);

  const minTurnsMet = turnsInChapter >= args.chapter.minTurns;
  const confidence = Math.min(
    1,
    (minTurnsMet ? 0.12 : 0) +
      (hasResolvedSmallQuestion ? 0.23 : 0) +
      (hasNewHook ? 0.2 : 0) +
      (hasPlayerChoiceEcho ? 0.18 : 0) +
      (hasReadablePause ? 0.15 : 0) +
      (hasNoLoreConflict ? 0.12 : 0) +
      (recapEntries.length > 0 ? 0.04 : 0) +
      (args.directorPlan.beatMode === "quiet" || args.directorPlan.beatMode === "aftershock" ? 0.03 : 0)
  );
  const roundedConfidence = Math.round(confidence * 100) / 100;
  const shouldClose =
    minTurnsMet &&
    hasResolvedSmallQuestion &&
    hasNewHook &&
    hasPlayerChoiceEcho &&
    hasReadablePause &&
    hasNoLoreConflict &&
    roundedConfidence >= 0.75;
  const reason = shouldClose
    ? actualChoiceEcho
      ? "chapter_reasoner_close"
      : "chapter_reasoner_close:first_chapter_intervention"
    : `waiting:${[
        !minTurnsMet ? "min_turns" : "",
        !hasResolvedSmallQuestion ? "small_question" : "",
        !hasNewHook ? "new_hook" : "",
        !hasPlayerChoiceEcho ? "choice_echo" : "",
        !hasReadablePause ? "readable_pause" : "",
        !hasNoLoreConflict ? "lore_conflict" : "",
      ].filter(Boolean).join("|")}`;
  const nextTitle = nextChapterTitleCandidate(args.chapter, shouldClose);

  return {
    shouldClose,
    confidence: roundedConfidence,
    hasResolvedSmallQuestion,
    hasNewHook,
    hasPlayerChoiceEcho,
    hasReadablePause,
    hasNoLoreConflict,
    reason,
    playerRecapCandidate: buildCloseRecapCandidate({
      chapter: args.chapter,
      recapEntries,
      hasFirstChapterIntervention,
      hasNewHook,
    }),
    modelSummaryCandidate: clampText(
      [
        `chapter=${args.chapter.currentChapterId}`,
        `reason=${reason}`,
        `resolved=${resolvedThreads.slice(0, 4).map(getMemoryEntryId).join(",")}`,
        `open=${openThreads.slice(0, 4).map(getMemoryEntryId).join(",")}`,
        `echo=${mustEchoEntries.slice(0, 4).map(getMemoryEntryId).join(",")}`,
      ].join(";"),
      420
    ),
    nextChapterTitleCandidate: nextTitle,
  };
}

function selectChapterPhase(args: {
  director: StoryDirectorState;
  chapter: ChapterDirectorState;
  signals: DirectorSignals;
  revealCandidateIds: string[];
  mustEchoMemoryIds: string[];
  nowTurn: number;
}): ChapterPhase {
  const { director, chapter, signals } = args;
  const turnsInChapter = Math.max(0, args.nowTurn - chapter.startedTurn);
  const close = chapter.closeCandidate;
  if (close?.shouldClose) return "closing";
  if (chapter.chapterPhase === "closing") return "closing";
  if (turnsInChapter <= 1) return "opening";

  const unansweredChoice = (chapter.keyChoiceIds ?? []).some(
    (id) => !(chapter.echoedChoiceIds ?? []).includes(id)
  );
  const relationshipEcho =
    signals.relationshipUpdateCount > 0 ||
    args.mustEchoMemoryIds.some((id) => id.includes("relationship") || id.includes("rel"));
  const resolvedEcho = (chapter.resolvedThreadIds ?? []).length > 0 || signals.terminalTaskDelta > 0;
  const choiceWasAnswered = chapter.chapterPhase === "choice" && signals.progressed;
  const needsEcho = relationshipEcho || unansweredChoice || choiceWasAnswered || resolvedEcho;

  if (
    chapter.chapterPhase === "reveal" &&
    (signals.highPressure || signals.nearPeak || signals.progressed)
  ) {
    return "aftershock";
  }
  if (chapter.chapterPhase === "aftershock" && signals.highPressure && !signals.stalled) {
    return "aftershock";
  }

  if (needsEcho) return "echo";

  const mustOfferChoice = signals.stalled || (director.stallCount ?? 0) >= 2;
  const conflictNeedsChoice =
    (signals.threatHot || signals.mainThreatUpdateCount > 0 || signals.nearPeak) && !signals.progressed;
  if (mustOfferChoice || conflictNeedsChoice) return "choice";

  const revealReady =
    args.revealCandidateIds.length > 0 ||
    signals.hooksReady ||
    args.mustEchoMemoryIds.some((id) => (chapter.openThreadIds ?? []).includes(id));
  if (revealReady && !signals.stalled) return "reveal";

  return "rising";
}

export function buildChapterWriterInstruction(phase: ChapterPhase): string {
  switch (phase) {
    case "opening":
      return "承接章节标题或上一章回望，用一个可感知场景把本章问题立起来；不要写系统阶段、章节进度或结算。";
    case "choice":
      return "玩家停滞或冲突升温；推动一次有意义、可回避、不会强制失败的选择压力，仍用小说场景表达。";
    case "echo":
      return "让玩家刚才的选择、承诺或关系变化自然回响到场景、动作或对白里，不要写成获得/失去列表。";
    case "reveal":
      return "回收一个旧钩子或秘密碎片的小揭露，只露出可感知的一角，不解释完整设定或幕后真相。";
    case "aftershock":
      return "保留余震和后果感，允许短暂停顿；不要立刻解释真相，也不要把危险写没。";
    case "closing":
      return "准备自然收束、前情回望素材和下一章种子；不要展示章节完成、奖励、进度条或行动结算。";
    case "rising":
    default:
      return "继续用行动、环境变化和人物反应推进本章核心疑问，制造可读的小说张力，避免系统化说明。";
  }
}

export function planChapterStep(args: {
  director: StoryDirectorState;
  signals: DirectorSignals;
  memoryEntries: MemorySpineEntry[];
  nowTurn: number;
}): {
  chapter: ChapterDirectorState;
  writerInstruction: string;
  mustEchoMemoryIds: string[];
  shouldPrepareClose: boolean;
} {
  const chapter = args.director.chapter;
  const openThreadIds = uniq(
    [
      ...(chapter.openThreadIds ?? []),
      ...collectThreadIds(args.memoryEntries ?? [], "open", 16),
    ],
    16
  );
  const resolvedThreadIds = uniq(
    [
      ...(chapter.resolvedThreadIds ?? []),
      ...collectThreadIds(args.memoryEntries ?? [], "resolved", 16),
    ],
    16
  );
  const baseMustEchoMemoryIds = uniq(
    [
      ...collectMustEchoMemoryIds(args.memoryEntries ?? []),
      ...(chapter.mustEchoMemoryIds ?? []),
    ],
    8
  );
  const revealCandidateIds = collectRevealCandidateIds(args.memoryEntries ?? []);
  const forbiddenRevealIds = uniq(
    [
      ...(chapter.forbiddenRevealIds ?? []),
      ...collectForbiddenRevealIds(args.memoryEntries ?? []),
    ],
    12
  );

  const provisionalChapter: ChapterDirectorState = {
    ...chapter,
    openThreadIds,
    resolvedThreadIds,
    mustEchoMemoryIds: baseMustEchoMemoryIds,
    forbiddenRevealIds,
  };
  const chapterPhase = selectChapterPhase({
    director: args.director,
    chapter: provisionalChapter,
    signals: args.signals,
    revealCandidateIds,
    mustEchoMemoryIds: baseMustEchoMemoryIds,
    nowTurn: args.nowTurn,
  });
  const mustEchoMemoryIds = uniq(
    [
      ...(chapterPhase === "reveal" ? revealCandidateIds.slice(0, 2) : []),
      ...baseMustEchoMemoryIds,
    ],
    8
  );
  const echoedChoiceIds =
    chapterPhase === "echo" ||
    chapterPhase === "reveal" ||
    chapterPhase === "aftershock" ||
    chapterPhase === "closing"
      ? uniq([...(chapter.echoedChoiceIds ?? []), ...(chapter.keyChoiceIds ?? []).slice(0, 4)], 16)
      : chapter.echoedChoiceIds;
  const turnsInChapter = Math.max(0, args.nowTurn - chapter.startedTurn);
  const close = chapter.closeCandidate;
  const shouldPrepareClose =
    chapterPhase === "closing" ||
    close?.shouldClose === true ||
    Boolean(close && close.confidence >= 0.66 && turnsInChapter >= chapter.targetTurns[0]);

  return {
    chapter: {
      ...chapter,
      chapterPhase,
      openThreadIds,
      resolvedThreadIds,
      echoedChoiceIds,
      mustEchoMemoryIds,
      forbiddenRevealIds,
    },
    writerInstruction: buildChapterWriterInstruction(chapterPhase),
    mustEchoMemoryIds,
    shouldPrepareClose,
  };
}
