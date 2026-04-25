import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAPTER_DEFINITIONS,
  CHAPTER_ONE_ID,
  CHAPTER_TWO_ID,
  createInitialChapterState,
  evaluateChapterProgress,
  getChapterDefinition,
  normalizeChapterState,
  recordChapterTurnInState,
  returnToActiveChapter,
  reviewCompletedChapter,
  shouldCompleteChapter,
  enterNextChapter,
} from "./index";
import type { ChapterTurnSignals } from "./types";

const first = getChapterDefinition(CHAPTER_ONE_ID)!;

function progressSignals(overrides: Partial<ChapterTurnSignals> = {}): ChapterTurnSignals {
  return {
    source: "option",
    isLegalAction: true,
    narrativeText: "门缝里传来压低的呼吸声，你确认这里不是普通公寓。",
    previousLocation: "B1_SafeZone",
    nextLocation: "B1_Storage",
    codexUpdateCount: 1,
    clueUpdateCount: 1,
    resultLines: ["你确认了当前区域存在异常。"],
    clueLines: ["线索指向门后的回声。"],
    ...overrides,
  };
}

test("old save chapter migration starts at chapter one active", () => {
  const migrated = normalizeChapterState(undefined, 1);
  assert.equal(migrated.activeChapterId, CHAPTER_ONE_ID);
  assert.equal(migrated.progressByChapterId[CHAPTER_ONE_ID].status, "active");
  assert.equal(migrated.progressByChapterId[CHAPTER_TWO_ID].status, "locked");
});

test("initial chapter state activates the first chapter", () => {
  const state = createInitialChapterState(1);
  assert.equal(state.activeChapterId, CHAPTER_ONE_ID);
  assert.deepEqual(state.completedChapterIds, []);
  assert.deepEqual(state.unlockedChapterIds, [CHAPTER_ONE_ID]);
});

test("valid turns accumulate turn count, narrative characters, and state changes", () => {
  const state = createInitialChapterState(1);
  const progress = state.progressByChapterId[CHAPTER_ONE_ID];
  const next = evaluateChapterProgress({ definition: first, progress, signals: progressSignals(), now: 2 });
  assert.equal(next.turnCount, 1);
  assert.equal(next.narrativeCharCount, progressSignals().narrativeText!.length);
  assert.equal(next.keyChoiceCount, 1);
  assert.equal(next.stateChangeCount >= 1, true);
});

test("first chapter completes, summarizes, and unlocks chapter two", () => {
  let state = createInitialChapterState(1);
  for (let i = 0; i < first.minTurns; i++) {
    state = recordChapterTurnInState({
      state,
      definition: first,
      signals: progressSignals({ logCountBefore: i, logCountAfter: i + 2 }),
      now: i + 2,
    });
  }
  const progress = state.progressByChapterId[CHAPTER_ONE_ID];
  assert.equal(progress.status, "completed");
  assert.equal(state.completedChapterIds.includes(CHAPTER_ONE_ID), true);
  assert.equal(state.unlockedChapterIds.includes(CHAPTER_TWO_ID), true);
  assert.equal(state.summariesByChapterId[CHAPTER_ONE_ID].title, "暗月初醒");
  assert.equal(state.pendingChapterEndId, CHAPTER_ONE_ID);
});

test("shouldCompleteChapter returns true once first chapter criteria are met", () => {
  let progress = createInitialChapterState(1).progressByChapterId[CHAPTER_ONE_ID];
  for (let i = 0; i < first.minTurns; i++) {
    progress = evaluateChapterProgress({
      definition: first,
      progress,
      signals: progressSignals(),
      now: i + 2,
    });
  }
  assert.equal(shouldCompleteChapter(progress, first), true);
});

test("entering chapter two keeps chapter one review safe and returns to active chapter", () => {
  let state = createInitialChapterState(1);
  for (let i = 0; i < first.minTurns; i++) {
    state = recordChapterTurnInState({
      state,
      definition: first,
      signals: progressSignals(),
      now: i + 2,
    });
  }
  state = enterNextChapter(state, CHAPTER_DEFINITIONS);
  assert.equal(state.activeChapterId, CHAPTER_TWO_ID);
  assert.equal(state.progressByChapterId[CHAPTER_TWO_ID].status, "active");

  state = reviewCompletedChapter(state, CHAPTER_ONE_ID);
  assert.equal(state.reviewChapterId, CHAPTER_ONE_ID);
  assert.equal(state.activeChapterId, CHAPTER_TWO_ID);

  state = returnToActiveChapter(state);
  assert.equal(state.reviewChapterId, null);
  assert.equal(state.activeChapterId, CHAPTER_TWO_ID);
  assert.equal(state.currentChapterId, CHAPTER_TWO_ID);
});

test("locked chapters cannot be reviewed into active state", () => {
  const state = createInitialChapterState(1);
  const reviewed = reviewCompletedChapter(state, CHAPTER_TWO_ID);
  assert.equal(reviewed.reviewChapterId, null);
  assert.equal(reviewed.activeChapterId, CHAPTER_ONE_ID);
});
