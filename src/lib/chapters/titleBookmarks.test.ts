import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveNextChapterTitleCandidate,
  formatChapterTitle,
  isWeakChapterBookmarkSnippet,
} from "@/lib/chapters/title";
import type { ChapterSummary } from "@/lib/chapters/types";
import { getChapterDefinition, CHAPTER_TWO_ID } from "@/lib/chapters/definitions";

test("isWeakChapterBookmarkSnippet flags generic hook clichés", () => {
  assert.equal(isWeakChapterBookmarkSnippet("新的线索已经指向下一处可回望的暗处。"), true);
  assert.equal(isWeakChapterBookmarkSnippet("沿第一章线索继续探索， facing NPC."), true);
  assert.equal(isWeakChapterBookmarkSnippet("潮湿门缝"), false);
});

test("deriveNextChapterTitleCandidate prefers concrete result lines over weak hooks", () => {
  const summary = {
    clueLines: ["新的线索已经指向下一处可回望的暗处。"],
    hook: "新的线索已经指向门后更深的回声。",
    nextObjective: "沿第一章线索继续探索，面对第一个更明确的阻碍或 NPC 迹象。",
    resultLines: ["门角的水迹被门槛截断，留下不自然的干燥边界。"],
  } as Partial<ChapterSummary> as ChapterSummary;
  const t = deriveNextChapterTitleCandidate({ summary, fallbackObjective: null });
  assert.ok(t && t.length > 0);
  assert.equal(isWeakChapterBookmarkSnippet(t ?? ""), false);
});

test("stored weak bookmark is omitted from display name for seeded chapters", () => {
  const def = getChapterDefinition(CHAPTER_TWO_ID);
  const state = {
    chapterTitlesById: {
      [CHAPTER_TWO_ID]: "新的线索已经指向下一处",
    },
  };
  assert.equal(formatChapterTitle(def, state as never), "第二章");
});
