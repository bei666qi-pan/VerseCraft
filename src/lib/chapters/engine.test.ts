import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAPTER_DEFINITIONS,
  CHAPTER_ONE_ID,
  CHAPTER_TWO_ID,
  advanceChapterBeats,
  createInitialChapterState,
  evaluateChapterProgress,
  getChapterDefinition,
  normalizeChapterState,
  recordChapterTurnInState,
  returnToActiveChapter,
  reviewCompletedChapter,
  shouldCompleteChapter,
  enterNextChapter,
  formatChapterTitle,
} from "./index";
import type { ChapterDefinition, ChapterTurnSignals } from "./types";

const first = getChapterDefinition(CHAPTER_ONE_ID)!;
const second = getChapterDefinition(CHAPTER_TWO_ID)!;

function acceptedCloseDecision() {
  return {
    shouldClose: true,
    confidence: 0.84,
    hasResolvedSmallQuestion: true,
    hasNewHook: true,
    hasPlayerChoiceEcho: true,
    hasReadablePause: true,
    hasNoLoreConflict: true,
    playerRecapCandidate: "本章的小问题已经收束，新的钩子指向门后。",
    modelSummaryCandidate: "chapter close accepted",
    nextChapterTitleCandidate: "潮湿门缝",
  };
}

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
  assert.equal(formatChapterTitle(getChapterDefinition(CHAPTER_TWO_ID), migrated), "第二章");
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

test("chapter one completes from local readiness, summarizes, and unlocks chapter two", () => {
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
  assert.equal(progress.completedBeatIds.includes("hook"), true);
  assert.equal(state.completedChapterIds.includes(CHAPTER_ONE_ID), true);
  assert.equal(state.unlockedChapterIds.includes(CHAPTER_TWO_ID), true);
  assert.equal(state.summariesByChapterId[CHAPTER_ONE_ID].title, "暗月初醒");
  assert.equal(state.pendingChapterEndId, CHAPTER_ONE_ID);
});

test("chapter two completes from local readiness including state-change and next-risk beats", () => {
  let state = createInitialChapterState(1);
  for (let i = 0; i < first.minTurns; i++) {
    state = recordChapterTurnInState({
      state,
      definition: first,
      signals: progressSignals(),
      runtime: i === first.minTurns - 1 ? { closeDecision: acceptedCloseDecision() } : undefined,
      now: i + 2,
    });
  }
  state = enterNextChapter(state, CHAPTER_DEFINITIONS);
  for (let i = 0; i < second.minTurns; i++) {
    state = recordChapterTurnInState({
      state,
      definition: second,
      signals: progressSignals({
        logCountBefore: i + 10,
        logCountAfter: i + 12,
        narrativeText: "你沿着第一章留下的潮湿痕迹继续搜查，阻碍在门后逐渐显形。",
        previousLocation: i === 0 ? "B1_Corridor" : "B1_Storage",
        nextLocation: i === 0 ? "B1_Storage" : "B1_Storage",
        taskUpdateCount: 1,
      }),
      now: i + 10,
    });
  }

  const progress = state.progressByChapterId[CHAPTER_TWO_ID];
  assert.equal(progress.status, "completed");
  assert.equal(progress.completedBeatIds.includes("state-change"), true);
  assert.equal(progress.completedBeatIds.includes("next-risk"), true);
  assert.equal(state.completedChapterIds.includes(CHAPTER_TWO_ID), true);
  assert.equal(state.pendingChapterEndId, CHAPTER_TWO_ID);
});

test("shouldCompleteChapter does not close before required local readiness", () => {
  let progress = createInitialChapterState(1).progressByChapterId[CHAPTER_ONE_ID];
  for (let i = 0; i < first.minTurns; i++) {
    progress = evaluateChapterProgress({
      definition: first,
      progress,
      signals: progressSignals({
        source: "manual",
        previousLocation: "B1_SafeZone",
        nextLocation: "B1_SafeZone",
        codexUpdateCount: 0,
        clueUpdateCount: 0,
        taskUpdateCount: 0,
      }),
      now: i + 2,
    });
  }
  assert.equal(progress.turnCount >= first.minTurns, true);
  assert.equal(progress.stateChangeCount, 0);
  assert.equal(shouldCompleteChapter(progress, first), false);
});

test("closeDecision still completes even when local required beats are incomplete", () => {
  const progress = {
    ...createInitialChapterState(1).progressByChapterId[CHAPTER_ONE_ID],
    status: "active" as const,
    turnCount: first.minTurns,
    narrativeCharCount: 120,
    keyChoiceCount: 0,
    stateChangeCount: 0,
    completedBeatIds: ["wake", "observe"],
  };
  assert.equal(shouldCompleteChapter(progress, first, { closeDecision: acceptedCloseDecision() }), true);
});

test("suppressCompletion prevents local chapter completion", () => {
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
  assert.equal(shouldCompleteChapter(progress, first, { suppressCompletion: true }), false);
});

test("death turn does not complete the chapter even when local readiness is met", () => {
  let state = createInitialChapterState(1);
  for (let i = 0; i < first.minTurns; i++) {
    state = recordChapterTurnInState({
      state,
      definition: first,
      signals: progressSignals({ isDeath: i === first.minTurns - 1 }),
      now: i + 2,
    });
  }
  assert.equal(state.progressByChapterId[CHAPTER_ONE_ID].status, "active");
  assert.equal(state.completedChapterIds.includes(CHAPTER_ONE_ID), false);
  assert.equal(state.pendingChapterEndId, null);
});

test("unknown beat ids do not crash and required unknown beats are not auto-completed", () => {
  const definition: ChapterDefinition = {
    ...first,
    id: "chapter-test-unknown",
    beats: [
      ...first.beats,
      { id: "unknown-required", label: "未知必需", description: "不能自动跳过", required: true },
      { id: "unknown-optional", label: "未知可选", description: "可在临近最大回合时补齐", required: false },
    ],
  };
  const progress = {
    ...createInitialChapterState(1).progressByChapterId[CHAPTER_ONE_ID],
    chapterId: definition.id,
    status: "active" as const,
    turnCount: definition.maxTurns - 1,
    narrativeCharCount: 1000,
    keyChoiceCount: definition.minKeyChoices,
    stateChangeCount: 1,
  };
  assert.doesNotThrow(() => advanceChapterBeats(definition, progress));
  const completed = advanceChapterBeats(definition, progress);
  assert.equal(completed.includes("unknown-required"), false);
  assert.equal(completed.includes("unknown-optional"), true);
});

test("completed chapter is not completed again", () => {
  let state = createInitialChapterState(1);
  for (let i = 0; i < first.minTurns; i++) {
    state = recordChapterTurnInState({
      state,
      definition: first,
      signals: progressSignals(),
      now: i + 2,
    });
  }
  const completedAt = state.progressByChapterId[CHAPTER_ONE_ID].completedAt;
  const summary = state.summariesByChapterId[CHAPTER_ONE_ID];

  state = recordChapterTurnInState({
    state,
    definition: first,
    signals: progressSignals({ narrativeText: "重复推进不应改写已经完成的章节。" }),
    runtime: { closeDecision: acceptedCloseDecision() },
    now: 99,
  });

  assert.equal(state.completedChapterIds.filter((id) => id === CHAPTER_ONE_ID).length, 1);
  assert.equal(state.progressByChapterId[CHAPTER_ONE_ID].completedAt, completedAt);
  assert.equal(state.summariesByChapterId[CHAPTER_ONE_ID], summary);
});

test("entering chapter two keeps chapter one review safe and returns to active chapter", () => {
  let state = createInitialChapterState(1);
  for (let i = 0; i < first.minTurns; i++) {
    state = recordChapterTurnInState({
      state,
      definition: first,
      signals: progressSignals(),
      runtime: i === first.minTurns - 1 ? { closeDecision: acceptedCloseDecision() } : undefined,
      now: i + 2,
    });
  }
  state = enterNextChapter(state, CHAPTER_DEFINITIONS);
  assert.equal(state.activeChapterId, CHAPTER_TWO_ID);
  assert.equal(state.progressByChapterId[CHAPTER_TWO_ID].status, "active");
  assert.equal(formatChapterTitle(getChapterDefinition(CHAPTER_TWO_ID), state), "第二章：潮湿门缝");

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
