import test from "node:test";
import assert from "node:assert/strict";
import { createInitialChapterPacingState } from "./types";
import { normalizeChapterPacingState, advanceChapterPacing } from "./chapterPacingController";
import { buildPacingSignalsForServer } from "./prompt";
import { clearChapterReasonerTrace, getChapterReasonerTrace } from "./chapterTrace";

function mkState(overrides?: Partial<ReturnType<typeof createInitialChapterPacingState>>) {
  return { ...createInitialChapterPacingState(0), ...(overrides ?? {}) } as any;
}

function mkMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_hook",
    kind: "hook",
    scope: "run_private",
    summary: "A new door echo remains unresolved.",
    salience: 0.82,
    confidence: 0.86,
    status: "active",
    createdAtHour: 1,
    lastTouchedAtHour: 1,
    ttlHours: 72,
    mergeKey: "hook:door_echo",
    anchors: {},
    recallTags: ["hook"],
    source: "system_hook",
    promoteToLore: false,
    ...overrides,
  } as any;
}

test("pacing state initializes chapter pacing defaults", () => {
  const state = createInitialChapterPacingState(0);
  assert.equal(state.chapter.currentChapterId, "chapter-1");
  assert.equal(state.chapter.chapterOrder, 1);
  assert.equal(state.chapter.chapterTitle, "暗月初醒");
  assert.equal(state.chapter.chapterPhase, "opening");
  assert.equal(state.chapter.closeCandidate, null);
  assert.equal(state.chapter.nextChapterSeed, null);
});

test("legacy pacing state without chapter is normalized with chapter pacing", () => {
  const state = normalizeChapterPacingState(
    {
      v: 1,
      arcId: "legacy_arc",
      tension: 55,
      stallCount: 2,
      openHookCodes: ["hook_a"],
    },
    9
  );
  assert.equal(state.arcId, "legacy_arc");
  assert.equal(state.tension, 55);
  assert.equal(state.chapter.currentChapterId, "chapter-1");
  assert.equal(state.chapter.chapterTitle, "暗月初醒");
  assert.equal(state.chapter.startedTurn, 9);
});

test("chapter bridge resets pacing chapter when active chapter changes", () => {
  const before = { playerLocation: "B1_SafeZone", tasks: [], mainThreatByFloor: {}, memoryEntries: [] };
  const out = advanceChapterPacing({
    stateRaw: createInitialChapterPacingState(0),
    nowTurn: 5,
    chapter: {
      currentChapterId: "chapter-2",
      chapterOrder: 2,
      chapterTitle: "潮湿门缝",
      promise: "把第一章留下的门缝回声带入更深处。",
      mainQuestion: "门后到底是谁在回应玩家？",
      minTurns: 4,
      targetTurns: [4, 7],
      softMaxTurns: 7,
    },
    pre: before,
    post: before,
    resolvedTurn: {},
  });
  assert.equal(out.state.chapter.currentChapterId, "chapter-2");
  assert.equal(out.state.chapter.chapterOrder, 2);
  assert.equal(out.state.chapter.chapterTitle, "潮湿门缝");
  assert.equal(out.state.chapter.startedTurn, 5);
});

test("post-turn chapter phase enters choice when structured progress stalls", () => {
  const before = { playerLocation: "B1_SafeZone", tasks: [], mainThreatByFloor: {}, memoryEntries: [] };
  const pacing = createInitialChapterPacingState(0);
  pacing.stallCount = 1;
  pacing.chapter = {
    ...pacing.chapter,
    chapterPhase: "rising",
    startedTurn: 0,
    minTurns: 99,
  };

  const out = advanceChapterPacing({
    stateRaw: pacing,
    nowTurn: 4,
    pre: before,
    post: before,
    resolvedTurn: {},
  });

  assert.equal(out.state.chapter.chapterPhase, "choice");
});

test("post-turn chapter phase enters reveal when hooks are ready", () => {
  const before = {
    playerLocation: "B1_SafeZone",
    tasks: [],
    mainThreatByFloor: {},
    memoryEntries: [],
  };
  const after = {
    playerLocation: "B1_Corridor",
    tasks: [],
    mainThreatByFloor: {},
    memoryEntries: [mkMemory({ id: "hook_reveal", mergeKey: "hook:reveal" })],
  };
  const pacing = createInitialChapterPacingState(0);
  pacing.openHookCodes = ["hook_reveal"];
  pacing.chapter = {
    ...pacing.chapter,
    chapterPhase: "rising",
    startedTurn: 0,
    minTurns: 99,
  };

  const out = advanceChapterPacing({
    stateRaw: pacing,
    nowTurn: 5,
    pre: before,
    post: after,
    resolvedTurn: {},
  });

  assert.equal(out.state.chapter.chapterPhase, "reveal");
  assert.ok(out.state.chapter.mustEchoMemoryIds.includes("hook_reveal"));
});

test("post-turn chapter phase enters aftershock after reveal under high pressure", () => {
  const before = { playerLocation: "B1_SafeZone", tasks: [], mainThreatByFloor: {}, memoryEntries: [] };
  const after = {
    playerLocation: "B1_SafeZone",
    tasks: [],
    mainThreatByFloor: { B1: { phase: "active" } },
    memoryEntries: [],
  };
  const pacing = createInitialChapterPacingState(0);
  pacing.chapter = {
    ...pacing.chapter,
    chapterPhase: "reveal",
    startedTurn: 0,
    minTurns: 99,
  };

  const out = advanceChapterPacing({
    stateRaw: pacing,
    nowTurn: 6,
    pre: before,
    post: after,
    resolvedTurn: {},
  });

  assert.equal(out.state.chapter.chapterPhase, "aftershock");
});

test("stallCount escalates when no effective progress", () => {
  const before = {
    playerLocation: "B1_SafeZone",
    tasks: [],
    mainThreatByFloor: {},
    memoryEntries: [],
  };
  const after = { ...before };
  let d: any = mkState({ stallCount: 0, tension: 10, pressureBudget: 60, recentPeakTurn: -99 });
  for (let turn = 1; turn <= 3; turn++) {
    const out = advanceChapterPacing({
      stateRaw: d,
      nowTurn: turn,
      pre: before,
      post: after,
      resolvedTurn: { task_updates: [], main_threat_updates: [] },
    });
    d = out.state;
  }
  assert.ok(d.stallCount >= 2);
});

test("stallCount decreases on task terminal progress", () => {
  const before = {
    playerLocation: "B1_SafeZone",
    tasks: [{ id: "t1", status: "active" }],
    mainThreatByFloor: {},
    memoryEntries: [],
  } as any;
  const after = {
    ...before,
    tasks: [{ id: "t1", status: "completed" }],
  } as any;
  const out = advanceChapterPacing({
    stateRaw: mkState({ stallCount: 3, tension: 40 }),
    nowTurn: 5,
    pre: before,
    post: after,
    resolvedTurn: { task_updates: [{ id: "t1", status: "completed" }] },
  });
  assert.ok(out.state.stallCount <= 3);
  assert.ok(out.state.tension <= 40);
});

test("chapter pacing can produce close candidate and next chapter seed", () => {
  clearChapterReasonerTrace();
  const before = {
    playerLocation: "B1_SafeZone",
    tasks: [{ id: "small_question", status: "active" }],
    mainThreatByFloor: {},
    memoryEntries: [],
  } as any;
  const after = {
    playerLocation: "B1_SafeZone",
    tasks: [{ id: "small_question", status: "completed" }],
    mainThreatByFloor: {},
    memoryEntries: [
      {
        id: "promise_done",
        kind: "promise",
        status: "resolved",
        summary: "玩家确认门缝后的异常不是普通漏水。",
        salience: 0.8,
        confidence: 0.9,
        createdAtHour: 1,
        lastTouchedAtHour: 1,
        ttlHours: 72,
        mergeKey: "promise:door",
        anchors: {},
        recallTags: ["promise"],
        source: "task_update",
        promoteToLore: false,
      },
      {
        id: "hook_next",
        kind: "hook",
        status: "active",
        summary: "门后传来新的回声。",
        salience: 0.82,
        confidence: 0.86,
        createdAtHour: 1,
        lastTouchedAtHour: 1,
        ttlHours: 72,
        mergeKey: "hook:door_echo",
        anchors: {},
        recallTags: ["hook"],
        source: "system_hook",
        promoteToLore: false,
      },
    ],
  } as any;
  const pacing = createInitialChapterPacingState(0);
  pacing.openHookCodes = ["hook_next"];
  pacing.recentPeakTurn = -99;
  pacing.chapter = {
    ...pacing.chapter,
    startedTurn: 0,
    minTurns: 1,
    targetTurns: [1, 3],
    softMaxTurns: 5,
  };
  const out = advanceChapterPacing({
    stateRaw: pacing,
    nowTurn: 3,
    pre: before,
    post: after,
    resolvedTurn: {
      task_updates: [{ id: "small_question", status: "completed" }],
      next_chapter_title_candidate: "潮湿门缝",
    },
  });

  assert.equal(out.state.chapter.chapterPhase, "closing");
  assert.equal(out.state.chapter.closeCandidate?.shouldClose, true);
  assert.ok((out.state.chapter.closeCandidate?.confidence ?? 0) >= 0.72);
  assert.equal(out.state.chapter.nextChapterSeed?.title, "潮湿门缝");
  assert.ok(out.state.chapter.summaryForPlayer);
  const traces = getChapterReasonerTrace();
  const trace = traces[traces.length - 1];
  assert.ok(trace);
  assert.equal(trace.turn, 3);
  assert.equal(trace.chapterId, "chapter-1");
  assert.equal(trace.phaseBefore, "opening");
  assert.equal(trace.phaseAfter, "closing");
  assert.equal(trace.closeDecision?.shouldClose, true);
  assert.ok(trace.closeDecision?.reason.includes("chapter_reasoner_close"));
  assert.ok(trace.mustEchoMemoryIds.includes("hook_next"));
  assert.ok(trace.selectedThreadIds.includes("hook_next"));
  assert.ok(trace.selectedThreadIds.includes("promise_done"));
  assert.equal(trace.nextChapterSeed?.title, "潮湿门缝");
  assert.equal(trace.suppressedGameyUi, true);
});

test("directorDigest is length-capped", () => {
  const dig = buildPacingSignalsForServer({
    tension: 88,
    stallCount: 3,
    beatModeHint: "peak",
    pressureFlags: ["stalling", "high_threat", "hooks_ready", "debt_pileup"],
    mustRecallHookCodes: ["hook_a", "hook_b", "hook_c"],
  });
  assert.ok(dig.digest.length <= 220);
});
