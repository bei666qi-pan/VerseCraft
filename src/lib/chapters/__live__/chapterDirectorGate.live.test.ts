/**
 * 章节 Director 计划门控 live 测试。
 *
 * 直接调用真实纯函数（无 mock）：
 *   - `recordChapterTurnInState`
 *   - `evaluateChapterAdvanceGate`
 *   - `getChapterDefinition` / `createInitialChapterState`
 *
 * 必须验证：
 *   1. 第一章 advance 不依赖 director plan；
 *   2. 第二章 advance 必须先有有效的 `nextChapterSeed.title`；
 *   3. 第一章的硬编码标题 `暗月初醒` 不被任何 seed 覆盖；
 *   4. gate 失败时不破坏 `chapterTitlesById` / `activeChapterId`。
 *
 * 跑法：`pnpm dlx tsx --test src/lib/chapters/__live__/chapterDirectorGate.live.test.ts`
 *   也可被 `pnpm test:unit` 自动收录（扫描 src 下的所有 *.test.ts）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAPTER_ONE_ID,
  CHAPTER_TWO_ID,
  createInitialChapterState,
  evaluateChapterAdvanceGate,
  formatChapterTitle,
  getChapterDefinition,
  recordChapterTurnInState,
} from "@/lib/chapters";
import type { ChapterTurnSignals } from "@/lib/chapters";
import { sanitizeChapterTitleCandidate } from "@/lib/chapters/title";
import type { ChapterDirectorState } from "@/lib/storyDirector/types";

const LONG_NARRATIVE = (): string =>
  "门缝后的潮气压在走廊里，灯影和脚步声一点点把新的线索推向更深处，墙壁的回音变得比水声还清晰，".repeat(40);

function buildSignals(overrides: Partial<ChapterTurnSignals> = {}): ChapterTurnSignals {
  return {
    source: "option",
    isLegalAction: true,
    narrativeText: LONG_NARRATIVE(),
    previousLocation: "B1_SafeZone",
    nextLocation: "B1_Storage",
    codexUpdateCount: 1,
    clueUpdateCount: 1,
    resultLines: ["确认了异常区域的存在。"],
    clueLines: ["线索指向门后的回声。"],
    logCountBefore: 0,
    logCountAfter: 2,
    ...overrides,
  };
}

function acceptedCloseDecision() {
  return {
    shouldClose: true,
    confidence: 0.9,
    hasResolvedSmallQuestion: true,
    hasNewHook: true,
    hasPlayerChoiceEcho: true,
    hasReadablePause: true,
    hasNoLoreConflict: true,
    playerRecapCandidate: "本章小问题已经收束，新的钩子指向下一处。",
    modelSummaryCandidate: "close",
    nextChapterTitleCandidate: "潮湿门缝",
  };
}

function buildDirectorChapterForTwo(seedTitle: string): ChapterDirectorState {
  return {
    v: 1,
    currentChapterId: CHAPTER_TWO_ID,
    chapterOrder: 2,
    chapterTitle: "第二章",
    chapterPhase: "closing",
    promise: "承接余响",
    mainQuestion: "门后会发生什么？",
    emotionalTone: "压迫",
    startedTurn: 6,
    minTurns: 4,
    targetTurns: [4, 8],
    softMaxTurns: 10,
    openThreadIds: [],
    resolvedThreadIds: [],
    keyChoiceIds: [],
    echoedChoiceIds: [],
    mustEchoMemoryIds: [],
    forbiddenRevealIds: [],
    closeCandidate: null,
    nextChapterSeed: {
      title: seedTitle,
      promise: "p",
      mainQuestion: "q",
      emotionalTone: "t",
      mustEchoMemoryIds: [],
      inheritedThreadIds: [],
    },
    summaryForPlayer: null,
    summaryForModel: null,
  };
}

test("chapter-1 advances without any director plan (title stays 暗月初醒)", () => {
  let state = createInitialChapterState(1);
  for (let i = 0; i < 3; i++) {
    state = recordChapterTurnInState({
      state,
      definition: getChapterDefinition(CHAPTER_ONE_ID)!,
      signals: buildSignals({ logCountBefore: i, logCountAfter: i + 2 }),
      runtime:
        i === 2
          ? {
              closeDecision: acceptedCloseDecision(),
              directorChapter: null, // 第一章明确不需要 plan
            }
          : undefined,
      now: i + 2,
    });
  }
  assert.equal(state.activeChapterId, CHAPTER_TWO_ID);
  assert.equal(state.completedChapterIds.includes(CHAPTER_ONE_ID), true);
  assert.equal(state.chapterTitlesById[CHAPTER_ONE_ID], "暗月初醒");
  assert.equal(
    formatChapterTitle(getChapterDefinition(CHAPTER_ONE_ID), state),
    "第一章：暗月初醒",
    "chapter-1 must keep hardcoded product title"
  );
});

test("chapter-2 cannot advance when directorChapter has no nextChapterSeed", () => {
  let state = createInitialChapterState(1);
  // chapter-1 关闭，进入 chapter-2。
  for (let i = 0; i < 3; i++) {
    state = recordChapterTurnInState({
      state,
      definition: getChapterDefinition(CHAPTER_ONE_ID)!,
      signals: buildSignals({ logCountBefore: i, logCountAfter: i + 2 }),
      runtime: i === 2 ? { closeDecision: acceptedCloseDecision() } : undefined,
      now: i + 2,
    });
  }
  const stateBeforeGate = state;
  // chapter-2 触发本地 ready（无 closeDecision）但无 director plan → 被 gate 拦住。
  for (let i = 0; i < 4; i++) {
    state = recordChapterTurnInState({
      state,
      definition: getChapterDefinition(CHAPTER_TWO_ID)!,
      signals: buildSignals({
        logCountBefore: i + 10,
        logCountAfter: i + 12,
        narrativeText: LONG_NARRATIVE() + ` 第 ${i + 1} 段。`,
        previousLocation: i === 0 ? "B1_Corridor" : "B1_Storage",
        nextLocation: i === 0 ? "B1_Storage" : "B1_Storage",
        taskUpdateCount: 1,
      }),
      runtime: undefined,
      now: i + 10,
    });
  }
  assert.equal(state.activeChapterId, CHAPTER_TWO_ID, "must stay on chapter-2");
  assert.equal(state.completedChapterIds.includes(CHAPTER_TWO_ID), false);
  assert.equal(
    state.progressByChapterId[CHAPTER_TWO_ID].status,
    "active",
    "chapter-2 progress must remain active without plan"
  );
  // 不替换 chapterTitlesById：旧的 chapter-2 标题（来自 chapter-1 close 的 `潮湿门缝`）保留。
  assert.equal(state.chapterTitlesById[CHAPTER_TWO_ID], stateBeforeGate.chapterTitlesById[CHAPTER_TWO_ID]);
});

test("chapter-2 advances when directorChapter.nextChapterSeed.title is provided", () => {
  let state = createInitialChapterState(1);
  for (let i = 0; i < 3; i++) {
    state = recordChapterTurnInState({
      state,
      definition: getChapterDefinition(CHAPTER_ONE_ID)!,
      signals: buildSignals({ logCountBefore: i, logCountAfter: i + 2 }),
      runtime: i === 2 ? { closeDecision: acceptedCloseDecision() } : undefined,
      now: i + 2,
    });
  }
  for (let i = 0; i < 4; i++) {
    state = recordChapterTurnInState({
      state,
      definition: getChapterDefinition(CHAPTER_TWO_ID)!,
      signals: buildSignals({
        logCountBefore: i + 10,
        logCountAfter: i + 12,
        narrativeText: LONG_NARRATIVE() + ` 第 ${i + 1} 段。`,
        previousLocation: i === 0 ? "B1_Corridor" : "B1_Storage",
        nextLocation: i === 0 ? "B1_Storage" : "B1_Storage",
        taskUpdateCount: 1,
      }),
      runtime: {
        directorChapter: buildDirectorChapterForTwo("门缝低语"),
      },
      now: i + 10,
    });
  }
  assert.equal(state.activeChapterId, "chapter-3", "must enter chapter-3 when plan is given");
  assert.equal(state.chapterTitlesById["chapter-3"], "门缝低语");
  assert.equal(state.completedChapterIds.includes(CHAPTER_TWO_ID), true);
});

test("evaluateChapterAdvanceGate: chapter-1 always ok; chapter ≥ 2 needs seed", () => {
  const state = createInitialChapterState(1);
  const firstDef = getChapterDefinition(CHAPTER_ONE_ID)!;
  const secondDef = getChapterDefinition(CHAPTER_TWO_ID)!;
  // chapter-1 ok even with no plan.
  const gateOne = evaluateChapterAdvanceGate({
    state,
    definition: firstDef,
    nextDefinition: secondDef,
    directorChapter: null,
  });
  assert.deepEqual(gateOne, { ok: true });

  // chapter-2 without seed → blocked.
  const gateTwoBlocked = evaluateChapterAdvanceGate({
    state,
    definition: secondDef,
    nextDefinition: getChapterDefinition("chapter-3")!,
    directorChapter: null,
  });
  assert.equal(gateTwoBlocked.ok, false);
  if (!gateTwoBlocked.ok) {
    assert.equal(gateTwoBlocked.reason, "director_plan_missing");
  }

  // chapter-2 with seed → ok.
  const gateTwoOk = evaluateChapterAdvanceGate({
    state,
    definition: secondDef,
    nextDefinition: getChapterDefinition("chapter-3")!,
    directorChapter: buildDirectorChapterForTwo("潮湿门缝"),
  });
  assert.deepEqual(gateTwoOk, { ok: true });
});

test("evaluateChapterAdvanceGate: weak / duplicate / null titles are rejected", () => {
  const state = createInitialChapterState(1);
  const secondDef = getChapterDefinition(CHAPTER_TWO_ID)!;
  const thirdDef = getChapterDefinition("chapter-3")!;
  const sanitized = sanitizeChapterTitleCandidate("门缝低语", 32);
  assert.ok(sanitized);

  // seed.title 为空字符串 → blocked。
  const gateEmpty = evaluateChapterAdvanceGate({
    state,
    definition: secondDef,
    nextDefinition: thirdDef,
    directorChapter: { ...buildDirectorChapterForTwo("门缝低语"), nextChapterSeed: null },
  });
  assert.equal(gateEmpty.ok, false);

  // seed.title 命中 legacy 硬编码短句（"沿当前线索继续推进"）→ 被 sanitize 拒绝。
  const gateWeak = evaluateChapterAdvanceGate({
    state,
    definition: secondDef,
    nextDefinition: thirdDef,
    directorChapter: buildDirectorChapterForTwo("沿当前线索继续推进"),
  });
  assert.equal(gateWeak.ok, false);

  // seed.title 与已有 chapter-1 标题重复 → blocked。
  const stateWithDup = {
    ...state,
    chapterTitlesById: {
      ...state.chapterTitlesById,
      [CHAPTER_TWO_ID]: "门缝低语",
    },
  };
  const gateDup = evaluateChapterAdvanceGate({
    state: stateWithDup,
    definition: secondDef,
    nextDefinition: { ...thirdDef, id: "chapter-2" as typeof thirdDef.id },
    directorChapter: buildDirectorChapterForTwo("门缝低语"),
  });
  // 注意：id 与 chapter-2 重复时，`isUniqueChapterTitleKey` 跳过同 id 检查。
  // 这里使用 chapter-3 id 触发真正冲突。
  const gateDupReal = evaluateChapterAdvanceGate({
    state: stateWithDup,
    definition: secondDef,
    nextDefinition: thirdDef,
    directorChapter: buildDirectorChapterForTwo("门缝低语"),
  });
  assert.equal(gateDupReal.ok, false);
  if (!gateDupReal.ok) {
    assert.equal(gateDupReal.reason, "director_title_duplicate");
  }
});