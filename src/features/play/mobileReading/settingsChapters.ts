import {
  CHAPTER_DEFINITIONS,
  type ChapterId,
  type ChapterState,
} from "@/lib/chapters";

export type SettingsChapterItem = {
  id: ChapterId;
  title: string;
  status: "current" | "completed" | "unlocked" | "locked";
  statusLabel: string;
  actionLabel: string;
  selectable: boolean;
};

const CHAPTER_DISPLAY_TITLES: Record<string, string> = {
  "chapter-1": "第一章·暗月初醒",
  "chapter-2": "第二章·门后回声",
};

export function buildSettingsChapterItems(chapterState: ChapterState): SettingsChapterItem[] {
  const completed = new Set(chapterState.completedChapterIds ?? []);
  const unlocked = new Set(chapterState.unlockedChapterIds ?? []);
  return [...CHAPTER_DEFINITIONS]
    .sort((a, b) => b.order - a.order)
    .map((definition) => {
      const isCurrent = definition.id === chapterState.activeChapterId && !chapterState.reviewChapterId;
      const isCompleted = completed.has(definition.id);
      const isUnlocked = unlocked.has(definition.id) || isCompleted || isCurrent;
      const status: SettingsChapterItem["status"] = isCurrent
        ? "current"
        : isCompleted
          ? "completed"
          : isUnlocked
            ? "unlocked"
            : "locked";
      return {
        id: definition.id,
        title: CHAPTER_DISPLAY_TITLES[definition.id] ?? `第${definition.order}章·${definition.title}`,
        status,
        statusLabel:
          status === "current"
            ? "当前章节"
            : status === "completed"
              ? "已解锁"
              : status === "unlocked"
                ? "已解锁"
                : "未解锁",
        actionLabel: status === "current" ? "当前" : status === "locked" ? "锁定" : "›",
        selectable: status === "completed" || (status === "unlocked" && definition.id === chapterState.activeChapterId),
      };
    });
}
