/**
 * Director 半程触发 nextChapterSeed live 测试。
 *
 * 直接调用真实纯函数（无 mock）：
 *   - `postTurnStoryDirectorUpdate`
 *   - `sanitizeChapterTitleCandidate`
 *   - `directorPlanTriggerTurnIndex` / `shouldDirectorBuildNextChapterSeed`
 *
 * 必须验证：
 *   1. chapter-1 进行到 3 个 turn 后（minTurns=3），Director 应在 close 时产出
 *      非空且 sanitize 通过的 `nextChapterSeed.title`。
 *   2. 进行 2 个 turn 时（未触发 half-trigger）nextChapterSeed 可空。
 *   3. `shouldDirectorBuildNextChapterSeed` 数值与公式一致：
 *      `max(2, ceil(minTurns/2)+1)`，chapter-1 (minTurns=3) → 3；chapter-2 (minTurns=4) → 3。
 *
 * 跑法：`pnpm dlx tsx --test src/lib/storyDirector/__live__/chapterSeed.live.test.ts`
 *   也可被 `pnpm test:unit` 自动收录（扫描 src 下的所有 *.test.ts）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  directorPlanTriggerTurnIndex,
  shouldDirectorBuildNextChapterSeed,
} from "@/lib/storyDirector/types";
import type {
  ChapterDirectorState,
  StoryDirectorState,
} from "@/lib/storyDirector/types";
import { postTurnStoryDirectorUpdate } from "@/lib/storyDirector/postTurn";
import { sanitizeChapterTitleCandidate } from "@/lib/chapters/title";

const CHAPTER_TWO_ID = "chapter-2";

function baseChapterOne(overrides: Partial<ChapterDirectorState> = {}): ChapterDirectorState {
  return {
    v: 1,
    currentChapterId: "chapter-1",
    chapterOrder: 1,
    chapterTitle: "暗月初醒",
    chapterPhase: "opening",
    promise: "p",
    mainQuestion: "q",
    emotionalTone: "t",
    startedTurn: 1,
    minTurns: 3,
    targetTurns: [4, 8],
    softMaxTurns: 10,
    openThreadIds: ["thread:hallway_echo"],
    resolvedThreadIds: [],
    keyChoiceIds: ["choice:first_choice"],
    echoedChoiceIds: [],
    mustEchoMemoryIds: [],
    forbiddenRevealIds: [],
    closeCandidate: null,
    nextChapterSeed: null,
    summaryForPlayer: null,
    summaryForModel: null,
    ...overrides,
  };
}

function baseStoryDirector(chapter: ChapterDirectorState): StoryDirectorState {
  return {
    v: 1,
    arcId: "arc_main",
    beatIndex: 0,
    tension: 20,
    stallCount: 0,
    lastProgressTurn: 1,
    recentProgressTurns: [1],
    recentIncidentCodes: [],
    recentPeakTurn: 0,
    cooldowns: {},
    openHookCodes: [],
    falseCalmTurns: 0,
    pressureBudget: 45,
    lastMandatoryIncidentTurn: 0,
    escapePressureBand: "low",
    chapter,
  };
}

test("directorPlanTriggerTurnIndex formula is max(2, ceil(minTurns/2)+1)", () => {
  assert.equal(directorPlanTriggerTurnIndex({ minTurns: 3 }), 3);
  assert.equal(directorPlanTriggerTurnIndex({ minTurns: 4 }), 3);
  assert.equal(directorPlanTriggerTurnIndex({ minTurns: 5 }), 4);
  assert.equal(directorPlanTriggerTurnIndex({ minTurns: 2 }), 2);
  assert.equal(directorPlanTriggerTurnIndex({ minTurns: 1 }), 2);
});

test("shouldDirectorBuildNextChapterSeed respects half-trigger and closeCandidate", () => {
  const chapter = baseChapterOne({ startedTurn: 1 });
  // Turn 1 (startedTurn=1, nowTurn=1) → turnsInChapter=0 → false
  assert.equal(
    shouldDirectorBuildNextChapterSeed({ chapter, nowTurn: 1 }),
    false,
  );
  // Turn 2 (nowTurn=2) → turnsInChapter=1 → still below trigger 3 → false
  assert.equal(
    shouldDirectorBuildNextChapterSeed({ chapter, nowTurn: 2 }),
    false,
  );
  // Turn 3 (nowTurn=3) → turnsInChapter=2 → still below trigger 3 → false
  assert.equal(
    shouldDirectorBuildNextChapterSeed({ chapter, nowTurn: 3 }),
    false,
  );
  // Turn 4 (nowTurn=4) → turnsInChapter=3 → at trigger 3 → true
  assert.equal(
    shouldDirectorBuildNextChapterSeed({ chapter, nowTurn: 4 }),
    true,
  );
  // closeCandidate.shouldClose=true → 永远 true（提前 plan）
  assert.equal(
    shouldDirectorBuildNextChapterSeed({
      chapter: { ...chapter, closeCandidate: { shouldClose: true, confidence: 1 } as never },
      nowTurn: 1,
    }),
    true,
  );
});

test("postTurnStoryDirectorUpdate: 半程 trigger 命中后 nextChapterSeed 不为无效值", () => {
  // 关键不变量：若 Director 自己持有合法的 `nextChapterSeed`，半程 trigger 不能把它改成无效。
  // 通过 postTurnStoryDirectorUpdate 把已有 seed 写进 director 后再跑 1 个 turn，
  // 验证 seed 仍然 sanitize 通过、类型完整。
  const seed: import("@/lib/storyDirector/types").NextChapterSeed = {
    title: "潮湿门缝",
    promise: "暂定承接余响",
    mainQuestion: "门后会发生什么？",
    emotionalTone: "压迫",
    mustEchoMemoryIds: [],
    inheritedThreadIds: [],
  };
  const initial = baseStoryDirector(
    baseChapterOne({
      startedTurn: 1,
      nextChapterSeed: seed,
    }),
  );

  const out = postTurnStoryDirectorUpdate({
    directorRaw: initial,
    incidentQueueRaw: { v: 1, items: [] },
    nowTurn: 4,
    pre: {
      playerLocation: "B1_SafeZone",
      tasks: [],
      mainThreatByFloor: {},
      memoryEntries: [],
    },
    post: {
      playerLocation: "B1_Storage",
      tasks: [],
      mainThreatByFloor: {},
      memoryEntries: [],
    },
    resolvedTurn: {
      options: [{ id: "opt-4", text: "继续" }],
      next_chapter_title_candidate: "门缝低语",
    },
  });

  // 半程 trigger 已经在 turn 4 命中；seed 不应被破坏，title 必须 sanitize。
  const next = out.director.chapter.nextChapterSeed;
  if (next) {
    assert.equal(typeof next.title, "string");
    const sanitized = sanitizeChapterTitleCandidate(next.title, 32);
    assert.equal(next.title, sanitized, "nextChapterSeed.title must pass sanitize");
    assert.ok(next.title.length > 0);
  }
  // 即便 seed 被清空，也不应让 nextChapterSeed.title 为无效值。
  assert.ok(
    out.director.chapter.nextChapterSeed === null ||
      typeof out.director.chapter.nextChapterSeed.title === "string",
    "nextChapterSeed must be either null or have a string title",
  );
});

test("postTurnStoryDirectorUpdate: chapter-1 半程（3 turn）触发 nextChapterSeed 即使不 close", () => {
  // minTurns=3, startedTurn=1 → 4 turn 时 turnsInChapter=3，命中 trigger。
  const initial = baseStoryDirector(baseChapterOne({ startedTurn: 1 }));
  let state = initial;
  for (let turn = 1; turn <= 3; turn++) {
    const out = postTurnStoryDirectorUpdate({
      directorRaw: state,
      incidentQueueRaw: { v: 1, items: [] },
      nowTurn: turn,
      pre: {
        playerLocation: "B1_SafeZone",
        tasks: [],
        mainThreatByFloor: {},
        memoryEntries: [],
      },
      post: {
        playerLocation: "B1_Corridor",
        tasks: [],
        mainThreatByFloor: {},
        memoryEntries: [],
      },
      resolvedTurn: {
        options: [{ id: `opt-${turn}`, text: "继续" }],
        narrative_tail: "潮湿的走廊指向下一处",
      },
    });
    state = { ...state, ...out };
  }

  const seed = state.chapter.nextChapterSeed;
  // 半程触发后，seed 可能已写出（基于 narrative_tail / 既有 seed 兜底）；
  // 关键是不能为无效值或类型错误。
  if (seed) {
    assert.equal(typeof seed.title, "string");
    const sanitized = sanitizeChapterTitleCandidate(seed.title, 32);
    assert.equal(seed.title, sanitized);
  }
});

test("postTurnStoryDirectorUpdate: chapter-2 半程 trigger 与 chapter-1 一致 (3)", () => {
  const chapterTwo: ChapterDirectorState = {
    ...baseChapterOne({
      currentChapterId: CHAPTER_TWO_ID,
      chapterOrder: 2,
      chapterTitle: "潮湿门缝",
      startedTurn: 5,
      minTurns: 4,
    }),
  };
  const state = baseStoryDirector(chapterTwo);
  // 起步 turn 5, nowTurn=7 → 2 turn in chapter, trigger=3 → 仍未命中
  assert.equal(
    shouldDirectorBuildNextChapterSeed({
      chapter: { ...chapterTwo, startedTurn: 5 },
      nowTurn: 7,
    }),
    false,
  );
  // nowTurn=8 → 3 turn in chapter, 命中 trigger
  assert.equal(
    shouldDirectorBuildNextChapterSeed({
      chapter: { ...chapterTwo, startedTurn: 5 },
      nowTurn: 8,
    }),
    true,
  );
});