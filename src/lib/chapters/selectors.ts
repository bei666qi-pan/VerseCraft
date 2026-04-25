import { CHAPTER_DEFINITIONS, getChapterDefinition } from "./definitions";
import type { ChapterDefinition, ChapterState } from "./types";

export function formatChapterTitle(definition: ChapterDefinition | null): string {
  if (!definition) return "第一章：暗月初醒";
  return `第${toChineseOrder(definition.order)}章：${definition.title}`;
}

function toChineseOrder(order: number): string {
  const map: Record<number, string> = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五" };
  return map[order] ?? String(order);
}

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
