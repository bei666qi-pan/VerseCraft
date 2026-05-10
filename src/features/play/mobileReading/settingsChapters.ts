import {
  formatChapterTitle,
  listChapterDefinitionsForState,
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

export function buildSettingsChapterItems(chapterState: ChapterState): SettingsChapterItem[] {
  const completed = new Set(chapterState.completedChapterIds ?? []);
  const unlocked = new Set(chapterState.unlockedChapterIds ?? []);
  const definitions = listChapterDefinitionsForState({
    activeChapterId: chapterState.activeChapterId,
    reviewChapterId: chapterState.reviewChapterId,
    unlockedChapterIds: chapterState.unlockedChapterIds,
    completedChapterIds: chapterState.completedChapterIds,
    progressByChapterId: chapterState.progressByChapterId,
  });
  return [...definitions]
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
        title: formatChapterTitle(definition, chapterState).replace("：", "·"),
        status,
        statusLabel:
          status === "current"
            ? "当前章节"
            : status === "completed"
              ? "已解锁"
              : status === "unlocked"
                ? "已解锁"
                : "未解锁",
        actionLabel: status === "current" ? "当前" : status === "locked" ? "锁定" : "进入",
        selectable: status === "completed" || (status === "unlocked" && definition.id === chapterState.activeChapterId),
      };
    });
}
