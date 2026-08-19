import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAPTER_ONE_ID,
  CHAPTER_TWO_ID,
  advanceChapterBeats,
  createInitialChapterState,
  evaluateChapterProgress,
  getChapterDefinition,
  normalizeChapterState,
  recordChapterTurnInState,
  resolveChapterNarrativeBudget,
  returnToActiveChapter,
  reviewCompletedChapter,
  shouldCompleteChapter,
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

function longNarrative(seed = "门缝后的潮气压在走廊里，灯影和脚步声一点点把新的线索推向更深处。"): string {
  // 每条 narrative 必须 ≥ MIN_CHAPTER_NARRATIVE_CHARS(=2000)；单条 70x ≈ 2170 字。
  return seed.repeat(70);
}

function progressSignals(overrides: Partial<ChapterTurnSignals> = {}): ChapterTurnSignals {
  return {
    source: "option",
    isLegalAction: true,
    narrativeText: longNarrative(),
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

test("chapter narrative budgets expose target ranges and hard caps", () => {
  const climaxDefinition: ChapterDefinition = {
    ...second,
    id: "chapter-climax",
    order: 7,
    kind: "climax",
    targetTextChars: [1, 2],
    hardTextChars: 3,
  };
  const endingDefinition: ChapterDefinition = {
    ...second,
    id: "chapter-ending",
    order: 8,
    kind: "ending",
    targetTextChars: [1, 2],
    hardTextChars: 3,
  };

  assert.deepEqual(resolveChapterNarrativeBudget(first), {
    targetTextChars: [2000, 3500],
    hardTextChars: 4200,
  });
  assert.deepEqual(resolveChapterNarrativeBudget(second), {
    targetTextChars: [2000, 4000],
    hardTextChars: 4500,
  });
  assert.deepEqual(
    resolveChapterNarrativeBudget(climaxDefinition),
    {
      targetTextChars: [2200, 4500],
      hardTextChars: 5200,
    }
  );
  assert.deepEqual(
    resolveChapterNarrativeBudget(endingDefinition),
    {
      targetTextChars: [2500, 5000],
      hardTextChars: 5200,
    }
  );
});

test("valid turns accumulate turn count, narrative characters, and state changes", () => {
  const state = createInitialChapterState(1);
  const progress = state.progressByChapterId[CHAPTER_ONE_ID];
  const next = evaluateChapterProgress({ definition: first, progress, signals: progressSignals(), now: 2 });
  assert.equal(next.turnCount, 1);
  assert.equal(next.narrativeCharCount, progressSignals().narrativeText!.length);
  assert.equal(next.keyChoiceCount, 1);
  assert.ok(next.stateChangeCount >= 1);
});

test("chapter one completes from local readiness, enters chapter two, and keeps recap choice", () => {
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
  for (const beatId of ["wake", "first-contact", "first-anomaly", "first-choice", "hook"]) {
    assert.ok(progress.completedBeatIds.includes(beatId), `chapter one beat ${beatId} not completed`);
  }
  assert.equal(state.completedChapterIds.includes(CHAPTER_ONE_ID), true);
  assert.equal(state.unlockedChapterIds.includes(CHAPTER_TWO_ID), true);
  assert.equal(state.summariesByChapterId[CHAPTER_ONE_ID].title, "暗月初醒");
  assert.equal(state.pendingChapterEndId, CHAPTER_ONE_ID);
  assert.equal(state.activeChapterId, CHAPTER_TWO_ID);
  assert.equal(state.currentChapterId, CHAPTER_TWO_ID);
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
  // 第二章结束回合：必须同时满足本地 ready 与 Director 计划门控（nextChapterSeed 存在）。
  const directorChapterTwoSeed = {
      currentChapterId: CHAPTER_TWO_ID,
      chapterOrder: 2,
      chapterTitle: "第二章",
      chapterPhase: "closing" as const,
      promise: "p",
      mainQuestion: "q",
      emotionalTone: "t",
      startedTurn: 6,
      minTurns: 4,
      targetTurns: [4, 8] as [number, number],
      softMaxTurns: 10,
      openThreadIds: [],
      resolvedThreadIds: [],
      keyChoiceIds: [],
      echoedChoiceIds: [],
      mustEchoMemoryIds: [],
      forbiddenRevealIds: [],
      closeCandidate: null,
      nextChapterSeed: {
        title: "门缝低语",
        promise: "承接余响",
        mainQuestion: "门后会发生什么？",
        emotionalTone: "压迫",
        mustEchoMemoryIds: [],
        inheritedThreadIds: [],
      },
      summaryForPlayer: null,
      summaryForModel: null,
      v: 1 as const,
    };
  for (let i = 0; i < second.minTurns; i++) {
    state = recordChapterTurnInState({
      state,
      definition: second,
      signals: progressSignals({
        logCountBefore: i + 10,
        logCountAfter: i + 12,
        narrativeText: longNarrative("我沿着第一章留下的潮湿痕迹继续搜查，阻碍在门后逐渐显形。"),
        previousLocation: i === 0 ? "B1_Corridor" : "B1_Storage",
        nextLocation: i === 0 ? "B1_Storage" : "B1_Storage",
        taskUpdateCount: 1,
      }),
      runtime:
        i === second.minTurns - 1
          ? { closeDecision: acceptedCloseDecision(), directorChapter: directorChapterTwoSeed }
          : { directorChapter: directorChapterTwoSeed },
      now: i + 10,
    });
  }

  const progress = state.progressByChapterId[CHAPTER_TWO_ID];
  assert.equal(progress.status, "completed");
  for (const beatId of ["new-objective", "search", "obstacle", "key-choice", "state-change", "next-risk"]) {
    assert.ok(progress.completedBeatIds.includes(beatId), `chapter two beat ${beatId} not completed`);
  }
  assert.equal(state.completedChapterIds.includes(CHAPTER_TWO_ID), true);
  assert.equal(state.pendingChapterEndId, CHAPTER_TWO_ID);
  // 进入下一章（chapter-3）后，导演 seed 应被写入 chapter-3 标题。
  assert.equal(state.activeChapterId, "chapter-3");
  assert.equal(state.chapterTitlesById["chapter-3"], "门缝低语");
});

test("chapter two cannot complete without Director nextChapterSeed even when local readiness is met", () => {
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
  // 第二章 close 但没有 directorChapter → 应当被 advance gate 拦住，
  // 进度停留在 active，pendingChapterEndId 不变。
  for (let i = 0; i < second.minTurns; i++) {
    state = recordChapterTurnInState({
      state,
      definition: second,
      signals: progressSignals({
        logCountBefore: i + 10,
        logCountAfter: i + 12,
        narrativeText: longNarrative("没有导演计划，我无法走向下一章，只能继续堆砌现在的章节。"),
        previousLocation: i === 0 ? "B1_Corridor" : "B1_Storage",
        nextLocation: i === 0 ? "B1_Storage" : "B1_Storage",
        taskUpdateCount: 1,
      }),
      runtime: undefined,
      now: i + 10,
    });
  }

  const progress = state.progressByChapterId[CHAPTER_TWO_ID];
  assert.equal(progress.status, "active");
  assert.equal(state.completedChapterIds.includes(CHAPTER_TWO_ID), false);
  // pendingChapterEndId 来自第一章收尾（chapter-1）——第二章被 gate 拦住时
  // 不产生新的 pendingChapterEndId 也不清除旧值，等待玩家继续累积叙事直到
  // Director 给 plan。
  assert.equal(state.pendingChapterEndId, CHAPTER_ONE_ID);
  assert.equal(state.activeChapterId, CHAPTER_TWO_ID);
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
    narrativeCharCount: 2200,
    keyChoiceCount: 0,
    stateChangeCount: 0,
    completedBeatIds: ["wake", "observe"],
  };
  assert.equal(shouldCompleteChapter(progress, first, { closeDecision: acceptedCloseDecision() }), true);
});

test("chapter cannot close before the minimum narrative length even with closeDecision", () => {
  const progress = {
    ...createInitialChapterState(1).progressByChapterId[CHAPTER_ONE_ID],
    status: "active" as const,
    turnCount: first.minTurns,
    narrativeCharCount: 1999,
    keyChoiceCount: first.minKeyChoices,
    stateChangeCount: 1,
    completedBeatIds: first.beats.map((beat) => beat.id),
  };
  assert.equal(shouldCompleteChapter(progress, first, { closeDecision: acceptedCloseDecision() }), false);
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

test("chapter completion does not invent a next title when the model omits the candidate", () => {
  let state = createInitialChapterState(1);
  const orderOnlyTitle = formatChapterTitle(second, state);
  for (let i = 0; i < first.minTurns; i++) {
    state = recordChapterTurnInState({
      state,
      definition: first,
      signals: progressSignals({
        clueLines: ["门缝后有潮湿脚印，指向储物间。"],
        resultLines: ["我确认安全区外的走廊不是普通通道。"],
      }),
      runtime:
        i === first.minTurns - 1
          ? { closeDecision: { ...acceptedCloseDecision(), nextChapterTitleCandidate: null } }
          : undefined,
      now: i + 2,
    });
  }

  const title = formatChapterTitle(second, state);
  assert.equal(title, orderOnlyTitle);
  assert.equal(state.chapterTitlesById[CHAPTER_TWO_ID], undefined);
});

test("normalization drops duplicate non-first chapter titles from older saves", () => {
  const state = normalizeChapterState({
    activeChapterId: CHAPTER_TWO_ID,
    currentChapterId: CHAPTER_TWO_ID,
    completedChapterIds: [CHAPTER_ONE_ID],
    unlockedChapterIds: [CHAPTER_ONE_ID, CHAPTER_TWO_ID],
    chapterTitlesById: {
      [CHAPTER_ONE_ID]: "暗月初醒",
      [CHAPTER_TWO_ID]: "暗月初醒",
    },
    progressByChapterId: {},
    summariesByChapterId: {},
  });
  assert.equal(state.chapterTitlesById[CHAPTER_ONE_ID], "暗月初醒");
  assert.equal(state.chapterTitlesById[CHAPTER_TWO_ID], undefined);
  assert.equal(formatChapterTitle(second, state), "第二章");
});

test("locked chapters cannot be reviewed into active state", () => {
  const state = createInitialChapterState(1);
  const reviewed = reviewCompletedChapter(state, CHAPTER_TWO_ID);
  assert.equal(reviewed.reviewChapterId, null);
  assert.equal(reviewed.activeChapterId, CHAPTER_ONE_ID);
});
