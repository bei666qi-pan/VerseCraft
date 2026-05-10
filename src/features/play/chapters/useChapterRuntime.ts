"use client";

import { useMemo } from "react";
import {
  enterNextChapter,
  formatChapterTitle,
  getChapterDisplayName,
  getChapterDefinition,
  listChapterDefinitionsForState,
  normalizeChapterState,
  returnToActiveChapter,
  reviewCompletedChapter,
  selectActiveChapterDefinition,
  selectDisplayedChapterDefinition,
  selectPendingChapterSummary,
} from "@/lib/chapters";
import { useGameStore } from "@/store/useGameStore";

export function useChapterRuntime() {
  const rawChapterState = useGameStore((s) => s.chapterState);
  const enterNextChapterAction = useGameStore((s) => s.enterNextChapter);
  const reviewChapterAction = useGameStore((s) => s.reviewChapter);
  const returnToActiveChapterAction = useGameStore((s) => s.returnToActiveChapter);
  const dismissChapterEnd = useGameStore((s) => s.dismissChapterEnd);
  const chapterState = useMemo(() => normalizeChapterState(rawChapterState), [rawChapterState]);
  const activeDefinition = selectActiveChapterDefinition(chapterState);
  const displayedDefinition = selectDisplayedChapterDefinition(chapterState);
  const displayedProgress = chapterState.progressByChapterId[displayedDefinition.id];
  const activeProgress = chapterState.progressByChapterId[activeDefinition.id];
  const pending = selectPendingChapterSummary(chapterState);
  const definitions = useMemo(
    () =>
      listChapterDefinitionsForState({
        activeChapterId: chapterState.activeChapterId,
        reviewChapterId: chapterState.reviewChapterId,
        unlockedChapterIds: chapterState.unlockedChapterIds,
        completedChapterIds: chapterState.completedChapterIds,
        progressByChapterId: chapterState.progressByChapterId,
      }),
    [chapterState]
  );
  return {
    chapterState,
    activeDefinition,
    displayedDefinition,
    displayedProgress,
    activeProgress,
    pending,
    isReviewing: Boolean(chapterState.reviewChapterId),
    headerTitle: formatChapterTitle(displayedDefinition, chapterState),
    displayedTitle: getChapterDisplayName(displayedDefinition, chapterState),
    activeTitle: getChapterDisplayName(activeDefinition, chapterState),
    nextDefinition: getChapterDefinition(pending?.definition.nextChapterId),
    previousDefinition: getChapterDefinition(displayedDefinition.previousChapterId),
    enterNextChapter: enterNextChapterAction,
    reviewChapter: reviewChapterAction,
    returnToActiveChapter: returnToActiveChapterAction,
    dismissChapterEnd,
    definitions,
    previewEnterNext: () => enterNextChapter(chapterState, definitions),
    previewReviewActive: () => reviewCompletedChapter(chapterState, displayedDefinition.id),
    previewReturnActive: () => returnToActiveChapter(chapterState),
  };
}
