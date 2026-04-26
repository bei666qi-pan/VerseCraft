import assert from "node:assert/strict";
import test from "node:test";
import { createInitialChapterState, enterNextChapter } from "@/lib/chapters";
import { CHAPTER_DEFINITIONS } from "@/lib/chapters";
import { buildSettingsChapterItems } from "./settingsChapters";

test("settings chapter list marks the active chapter and does not select it again", () => {
  const state = createInitialChapterState();
  const items = buildSettingsChapterItems(state);
  const current = items.find((item) => item.id === state.activeChapterId);
  assert.equal(current?.title, "第一章·暗月初醒");
  assert.equal(current?.status, "current");
  assert.equal(current?.selectable, false);
});

test("settings chapter list exposes completed chapters as selectable review targets", () => {
  const completed = {
    ...createInitialChapterState(),
    activeChapterId: "chapter-1",
    currentChapterId: "chapter-1",
    completedChapterIds: ["chapter-1"],
    unlockedChapterIds: ["chapter-1", "chapter-2"],
    pendingChapterEndId: "chapter-1",
    summariesByChapterId: {
      "chapter-1": {
        chapterId: "chapter-1",
        title: "暗月初醒",
        completedAt: 1,
        resultLines: [],
        obtainedLines: [],
        lostLines: [],
        relationshipLines: [],
        clueLines: [],
        nextObjective: "继续",
        hook: "门后有回声。",
      },
    },
  };
  const next = enterNextChapter(completed, CHAPTER_DEFINITIONS);
  const items = buildSettingsChapterItems(next);
  const chapterOne = items.find((item) => item.id === "chapter-1");
  const chapterTwo = items.find((item) => item.id === "chapter-2");
  assert.equal(chapterOne?.status, "completed");
  assert.equal(chapterOne?.selectable, true);
  assert.equal(chapterTwo?.status, "current");
});
