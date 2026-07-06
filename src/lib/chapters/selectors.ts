import {
  CHAPTER_DEFINITIONS,
  getChapterDefinition,
  listChapterDefinitionsForState,
} from "./definitions";
import { formatChapterTitle } from "./title";
import type { ChapterDefinition, ChapterId, ChapterState, ChapterSummary } from "./types";

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

function cleanTocText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTocExcerpt(value: string): string[] {
  return value
    .split(/(?<=[。！？!?])\s+|(?<=[。！？!?])/)
    .map(cleanTocText)
    .filter(Boolean)
    .slice(0, 2);
}

/** 与此前 `ChapterNavigator` 内联实现保持同样的摘要拼装规则：优先用玩家向摘要，
 * 其次退回结果/线索行与钩子拼接，最后按是否在读/是否已解锁给出兜底文案。 */
function buildChapterTocExcerpt(
  summary: ChapterSummary | undefined,
  isOpenForReading: boolean,
  isUnlocked: boolean
): string {
  const direct = splitTocExcerpt(summary?.summaryForPlayer ?? "");
  if (direct.length > 0) return direct.join("");

  const fallback = splitTocExcerpt(
    [
      ...(Array.isArray(summary?.resultLines) ? summary.resultLines : []),
      ...(Array.isArray(summary?.clueLines) ? summary.clueLines : []),
      summary?.hook,
    ]
      .map(cleanTocText)
      .filter(Boolean)
      .join(" ")
  );
  if (fallback.length > 0) return fallback.join("");

  if (isOpenForReading) return "这一章正在展开，新的回声还在纸页间等待回应。";
  if (isUnlocked) return "故事已经翻到这里，沿着上一章留下的回声继续读下去。";
  return "故事还没有写到这一页。";
}

export type ChapterTocStatus = "reviewing" | "current" | "completed" | "unlocked" | "locked";
export type ChapterTocAction = "review" | "return" | "enter" | "none";

export interface ChapterTocRow {
  id: ChapterId;
  definition: ChapterDefinition;
  /** 原始标题，形如"第一章：暗月初醒"；展示层按场景决定是否转写分隔符（例如设置里用"·"）。 */
  title: string;
  status: ChapterTocStatus;
  statusLabel: string;
  actionLabel: string;
  excerpt: string;
  selectable: boolean;
  action: ChapterTocAction;
}

/**
 * 章节目录行的唯一数据来源。此前"小说目录"内嵌面板（原 `selectChapterNavigatorItems`）与
 * 设置里的"切换章节"弹窗（原 `settingsChapters.ts` 的 `buildSettingsChapterItems`）分别
 * 重复实现了一套状态判断与文案；现在合并成一套，`ChapterTocList` 组件是唯一消费方，
 * 两个入口只保留各自的外层容器（内嵌面板 vs 居中弹窗）与标题分隔符差异。
 */
export function selectChapterTocRows(state: ChapterState): ChapterTocRow[] {
  const completedSet = new Set(state.completedChapterIds ?? []);
  const unlockedSet = new Set(state.unlockedChapterIds ?? []);
  const definitions = listChapterDefinitionsForState({
    activeChapterId: state.activeChapterId,
    reviewChapterId: state.reviewChapterId,
    unlockedChapterIds: state.unlockedChapterIds,
    completedChapterIds: state.completedChapterIds,
    progressByChapterId: state.progressByChapterId,
  });

  return definitions.map((definition) => {
    const id = definition.id;
    const isReviewingThis = state.reviewChapterId === id;
    const isActiveChapter = state.activeChapterId === id;
    // 正在回看别的章节时，真正的"当前章节"仍需在列表里保持可选中，点击即可返回正在阅读。
    const isReturnTarget = isActiveChapter && Boolean(state.reviewChapterId) && !isReviewingThis;
    const isCurrent = isActiveChapter && !state.reviewChapterId;
    const isCompleted = completedSet.has(id);
    const isUnlocked = unlockedSet.has(id) || isCompleted || isActiveChapter;
    const summary = state.summariesByChapterId?.[id];

    let status: ChapterTocStatus;
    let statusLabel: string;
    let actionLabel: string;
    let selectable: boolean;
    let action: ChapterTocAction;

    if (isReviewingThis) {
      status = "reviewing";
      statusLabel = "正在回看";
      actionLabel = "回到正在阅读";
      selectable = true;
      action = "return";
    } else if (isReturnTarget) {
      status = "current";
      statusLabel = "当前章节";
      actionLabel = "回到这里";
      selectable = true;
      action = "return";
    } else if (isCurrent) {
      status = "current";
      statusLabel = "正在阅读";
      actionLabel = "正在阅读";
      selectable = false;
      action = "none";
    } else if (isCompleted) {
      status = "completed";
      statusLabel = "已解锁 · 可回看";
      actionLabel = "回看本章";
      selectable = true;
      action = "review";
    } else if (isUnlocked) {
      status = "unlocked";
      statusLabel = "已解锁";
      actionLabel = "继续阅读";
      selectable = true;
      action = "enter";
    } else {
      status = "locked";
      statusLabel = "未解锁";
      actionLabel = "尚未写到";
      selectable = false;
      action = "none";
    }

    return {
      id,
      definition,
      title: formatChapterTitle(definition, state),
      status,
      statusLabel,
      actionLabel,
      excerpt: buildChapterTocExcerpt(summary, isCurrent || isReviewingThis, isUnlocked),
      selectable,
      action,
    };
  });
}
