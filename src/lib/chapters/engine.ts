import { getChapterDefinition } from "./definitions";
import { advanceChapterBeats, countChapterStateChanges, shouldCountChapterTurn, shouldCountKeyChoice } from "./progress";
import { buildChapterSummary } from "./summary";
import type {
  ChapterCompletionRuntime,
  ChapterDefinition,
  ChapterProgress,
  ChapterState,
  ChapterSummary,
  ChapterTurnSignals,
} from "./types";

export function createChapterProgress(
  definition: ChapterDefinition,
  status: ChapterProgress["status"],
  now: number | null = Date.now()
): ChapterProgress {
  return {
    chapterId: definition.id,
    status,
    startedAt: status === "active" ? now : null,
    completedAt: null,
    turnCount: 0,
    narrativeCharCount: 0,
    keyChoiceCount: 0,
    completedBeatIds: [],
    stateChangeCount: 0,
    lastObjectiveText: definition.objective,
    startedLogIndex: null,
    completedLogIndex: null,
  };
}

export function evaluateChapterProgress(input: {
  definition: ChapterDefinition;
  progress: ChapterProgress;
  signals: ChapterTurnSignals;
  now?: number;
}): ChapterProgress {
  const { definition, progress, signals } = input;
  if (progress.status === "completed" || progress.status === "locked") return progress;
  if (!shouldCountChapterTurn(signals)) return progress;

  const stateChangeDelta = countChapterStateChanges(signals);
  const narrativeText = String(signals.narrativeText ?? "");
  const next: ChapterProgress = {
    ...progress,
    status: "active",
    startedAt: progress.startedAt ?? input.now ?? Date.now(),
    turnCount: progress.turnCount + 1,
    narrativeCharCount: progress.narrativeCharCount + narrativeText.trim().length,
    keyChoiceCount: progress.keyChoiceCount + (shouldCountKeyChoice(signals, stateChangeDelta) ? 1 : 0),
    stateChangeCount: progress.stateChangeCount + stateChangeDelta,
    lastObjectiveText: definition.objective,
    startedLogIndex:
      typeof progress.startedLogIndex === "number"
        ? progress.startedLogIndex
        : typeof signals.logCountBefore === "number"
          ? Math.max(0, signals.logCountBefore)
          : progress.startedLogIndex ?? null,
  };
  return {
    ...next,
    completedBeatIds: advanceChapterBeats(definition, next),
  };
}

export function shouldCompleteChapter(
  progress: ChapterProgress,
  definition: ChapterDefinition,
  runtime: ChapterCompletionRuntime = {}
): boolean {
  if (runtime.suppressCompletion) return false;
  if (progress.status !== "active") return false;
  const completed = new Set(progress.completedBeatIds);
  const requiredBeats = definition.beats.filter((beat) => beat.required !== false);
  return (
    progress.turnCount >= definition.minTurns &&
    progress.keyChoiceCount >= definition.minKeyChoices &&
    progress.stateChangeCount >= 1 &&
    requiredBeats.every((beat) => completed.has(beat.id))
  );
}

export function completeChapter(input: {
  state: ChapterState;
  definition: ChapterDefinition;
  progress: ChapterProgress;
  summary: ChapterSummary;
  now?: number;
  completedLogIndex?: number | null;
}): ChapterState {
  const now = input.now ?? Date.now();
  const nextChapterId = input.definition.nextChapterId ?? null;
  const completedProgress: ChapterProgress = {
    ...input.progress,
    status: "completed",
    completedAt: input.progress.completedAt ?? now,
    completedBeatIds: Array.from(new Set(input.definition.beats.map((beat) => beat.id))),
    completedLogIndex:
      typeof input.completedLogIndex === "number"
        ? input.completedLogIndex
        : input.progress.completedLogIndex ?? null,
  };
  const unlockedChapterIds = Array.from(
    new Set([
      ...(input.state.unlockedChapterIds ?? []),
      input.definition.id,
      ...(nextChapterId ? [nextChapterId] : []),
    ])
  );
  return {
    ...input.state,
    currentChapterId: input.definition.id,
    progressByChapterId: {
      ...input.state.progressByChapterId,
      [input.definition.id]: completedProgress,
    },
    completedChapterIds: Array.from(new Set([...(input.state.completedChapterIds ?? []), input.definition.id])),
    unlockedChapterIds,
    summariesByChapterId: {
      ...input.state.summariesByChapterId,
      [input.definition.id]: input.summary,
    },
    pendingChapterEndId: input.definition.id,
    lastChapterEndAt: now,
  };
}

export function recordChapterTurnInState(input: {
  state: ChapterState;
  definition: ChapterDefinition;
  signals: ChapterTurnSignals;
  now?: number;
  runtime?: ChapterCompletionRuntime;
}): ChapterState {
  const progress =
    input.state.progressByChapterId[input.definition.id] ??
    createChapterProgress(input.definition, "active", input.now ?? Date.now());
  const nextProgress = evaluateChapterProgress({
    definition: input.definition,
    progress,
    signals: input.signals,
    now: input.now,
  });
  let nextState: ChapterState = {
    ...input.state,
    currentChapterId: input.state.reviewChapterId ?? input.state.activeChapterId,
    progressByChapterId: {
      ...input.state.progressByChapterId,
      [input.definition.id]: nextProgress,
    },
  };
  const suppressCompletion = input.runtime?.suppressCompletion || input.signals.isDeath === true;
  if (shouldCompleteChapter(nextProgress, input.definition, { suppressCompletion })) {
    const nextDefinition = getChapterDefinition(input.definition.nextChapterId);
    const completedAt = input.now ?? Date.now();
    const summary = buildChapterSummary({
      definition: input.definition,
      progress: nextProgress,
      signals: input.signals,
      completedAt,
      nextObjective: nextDefinition?.objective,
    });
    nextState = completeChapter({
      state: nextState,
      definition: input.definition,
      progress: nextProgress,
      summary,
      now: completedAt,
      completedLogIndex:
        typeof input.signals.logCountAfter === "number" ? Math.max(0, input.signals.logCountAfter - 1) : null,
    });
  }
  return nextState;
}

export function enterNextChapter(state: ChapterState, definitions: readonly ChapterDefinition[]): ChapterState {
  const pendingId = state.pendingChapterEndId ?? state.activeChapterId;
  const currentDefinition = getChapterDefinition(pendingId);
  const nextDefinition = currentDefinition?.nextChapterId
    ? definitions.find((chapter) => chapter.id === currentDefinition.nextChapterId) ?? null
    : null;
  if (!nextDefinition) {
    return { ...state, pendingChapterEndId: null, reviewChapterId: null };
  }
  const existing = state.progressByChapterId[nextDefinition.id];
  const nextProgress =
    existing && existing.status !== "locked"
      ? existing
      : createChapterProgress(nextDefinition, "active", Date.now());
  return {
    ...state,
    currentChapterId: nextDefinition.id,
    activeChapterId: nextDefinition.id,
    reviewChapterId: null,
    pendingChapterEndId: null,
    unlockedChapterIds: Array.from(new Set([...(state.unlockedChapterIds ?? []), nextDefinition.id])),
    progressByChapterId: {
      ...state.progressByChapterId,
      [nextDefinition.id]: {
        ...nextProgress,
        status: nextProgress.status === "completed" ? "completed" : "active",
        startedAt: nextProgress.startedAt ?? Date.now(),
      },
    },
  };
}

export function reviewCompletedChapter(state: ChapterState, chapterId: string): ChapterState {
  if (!state.completedChapterIds.includes(chapterId)) return state;
  return {
    ...state,
    currentChapterId: chapterId,
    reviewChapterId: chapterId,
    pendingChapterEndId: null,
  };
}

export function returnToActiveChapter(state: ChapterState): ChapterState {
  return {
    ...state,
    currentChapterId: state.activeChapterId,
    reviewChapterId: null,
    pendingChapterEndId: null,
  };
}
