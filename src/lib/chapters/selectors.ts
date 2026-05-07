import { CHAPTER_DEFINITIONS, getChapterDefinition } from "./definitions";
import type { ChapterDefinition, ChapterState } from "./types";

export function selectActiveChapterDefinition(state: ChapterState): ChapterDefinition {
  return getChapterDefinition(state.activeChapterId) ?? CHAPTER_DEFINITIONS[0];
}

export function selectDisplayedChapterDefinition(state: ChapterState): ChapterDefinition {
  return getChapterDefinition(state.reviewChapterId ?? state.activeChapterId) ?? CHAPTER_DEFINITIONS[0];
}

export function selectPendingChapterSummary(state: ChapterState) {
  const id = state.pendingChapterEndId;
  if (!id) return null;
  const summary = state.summariesByChapterId[id];
  const definition = getChapterDefinition(id);
  if (!summary || !definition) return null;
  return { id, summary, definition };
}

export function selectChapterNavigatorItems(state: ChapterState) {
  return CHAPTER_DEFINITIONS.map((definition) => {
    const progress = state.progressByChapterId[definition.id];
    const completed = state.completedChapterIds.includes(definition.id);
    const unlocked = state.unlockedChapterIds.includes(definition.id) || completed;
    return {
      definition,
      progress,
      completed,
      unlocked,
      active: state.activeChapterId === definition.id && !state.reviewChapterId,
      reviewing: state.reviewChapterId === definition.id,
    };
  });
}
