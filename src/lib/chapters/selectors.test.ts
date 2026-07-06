import assert from "node:assert/strict";
import test from "node:test";
import { createInitialChapterState, enterNextChapter, CHAPTER_DEFINITIONS } from "@/lib/chapters";
import { selectChapterTocRows } from "./selectors";

// 迁移自此前 `src/features/play/mobileReading/settingsChapters.test.ts`：
// `buildSettingsChapterItems` 与 `ChapterNavigator` 内联的行选择逻辑已合并为
// `selectChapterTocRows`，这里覆盖同样的场景，标题维持数据层原始的"："分隔符
// （设置弹窗展示时的"·"转写是纯展示层行为，由 `mobile-settings-ui.spec.ts` e2e 覆盖）。

test("chapter toc rows: active chapter is current and not selectable", () => {
  const state = createInitialChapterState();
  const rows = selectChapterTocRows(state);
  const current = rows.find((row) => row.id === state.activeChapterId);
  assert.equal(current?.title, "第一章：暗月初醒");
  assert.equal(current?.status, "current");
  assert.equal(current?.selectable, false);
});

test("chapter toc rows: completed chapters are selectable review targets", () => {
  const completed = {
    ...createInitialChapterState(),
    activeChapterId: "chapter-1",
    currentChapterId: "chapter-1",
    chapterTitlesById: {
      "chapter-1": "暗月初醒",
      "chapter-2": "潮湿门缝",
    },
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
  const rows = selectChapterTocRows(next);
  const chapterOne = rows.find((row) => row.id === "chapter-1");
  const chapterTwo = rows.find((row) => row.id === "chapter-2");
  assert.equal(chapterOne?.status, "completed");
  assert.equal(chapterOne?.selectable, true);
  assert.equal(chapterOne?.action, "review");
  assert.equal(chapterTwo?.status, "current");
  assert.equal(chapterTwo?.title, "第二章：潮湿门缝");
});

test("chapter toc rows: fall back to chapter order without a hardcoded second title", () => {
  const unlocked = {
    ...createInitialChapterState(),
    activeChapterId: "chapter-2",
    currentChapterId: "chapter-2",
    unlockedChapterIds: ["chapter-1", "chapter-2"],
  };
  const rows = selectChapterTocRows(unlocked);
  const chapterTwo = rows.find((row) => row.id === "chapter-2");
  assert.equal(chapterTwo?.title, "第二章");
});

test("chapter toc rows: reviewing a chapter keeps the real active chapter reachable as a return target", () => {
  const reviewing = {
    ...createInitialChapterState(),
    activeChapterId: "chapter-2",
    currentChapterId: "chapter-2",
    reviewChapterId: "chapter-1",
    completedChapterIds: ["chapter-1"],
    unlockedChapterIds: ["chapter-1", "chapter-2"],
  };
  const rows = selectChapterTocRows(reviewing);
  const chapterOne = rows.find((row) => row.id === "chapter-1");
  const chapterTwo = rows.find((row) => row.id === "chapter-2");
  assert.equal(chapterOne?.status, "reviewing");
  assert.equal(chapterOne?.action, "return");
  assert.equal(chapterOne?.selectable, true);
  // 真正的当前章节即便不在"正在阅读"态，也必须可以一键返回。
  assert.equal(chapterTwo?.status, "current");
  assert.equal(chapterTwo?.action, "return");
  assert.equal(chapterTwo?.selectable, true);
});

test("chapter toc rows: never surface the raw 锁定 wording used by the old settings-only list", () => {
  const state = createInitialChapterState();
  const rows = selectChapterTocRows(state);
  for (const row of rows) {
    assert.equal(row.actionLabel.includes("锁定"), false);
    assert.equal(row.statusLabel.includes("锁定"), false);
  }
});
