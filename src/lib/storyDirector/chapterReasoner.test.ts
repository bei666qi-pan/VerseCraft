import test from "node:test";
import assert from "node:assert/strict";
import type { MemorySpineEntry } from "@/lib/memorySpine/types";
import type { DirectorSignals } from "./signals";
import { evaluateChapterCloseDecision, planChapterStep } from "./chapterReasoner";
import { postTurnStoryDirectorUpdate } from "./postTurn";
import { createEmptyDirectorState, createEmptyIncidentQueue } from "./types";

function mkSignals(overrides: Partial<DirectorSignals> = {}): DirectorSignals {
  return {
    nowTurn: 0,
    effectiveProgressScore: 0,
    progressed: false,
    stalled: false,
    moved: false,
    terminalTaskDelta: 0,
    memoryEntryDelta: 0,
    relationshipUpdateCount: 0,
    taskUpdateCount: 0,
    mainThreatUpdateCount: 0,
    highPressure: false,
    threatHot: false,
    debtPileup: false,
    promisePileup: false,
    hooksReady: false,
    hookCodesReady: [],
    falseCalmRisk: false,
    nearPeak: false,
    loreConflict: false,
    notes: [],
    ...overrides,
  };
}

function mem(overrides: Partial<MemorySpineEntry>): MemorySpineEntry {
  return {
    id: "mem_1",
    kind: "hook",
    scope: "run_private",
    summary: "structured memory",
    salience: 0.8,
    confidence: 0.9,
    status: "active",
    createdAtHour: 0,
    lastTouchedAtHour: 0,
    ttlHours: 72,
    mergeKey: "hook:mem_1",
    anchors: {},
    recallTags: [],
    source: "system_hook",
    promoteToLore: false,
    ...overrides,
  };
}

function mkPlan(overrides: Record<string, unknown> = {}) {
  return {
    beatMode: "quiet",
    mustAdvance: false,
    mustRecallHookCodes: [],
    preferredIncidentCode: null,
    softPressureHint: null,
    hardConstraint: null,
    suppressions: [],
    pressureFlags: [],
    ...overrides,
  } as any;
}

function assertNoRawPhaseInstruction(text: string): void {
  for (const raw of ["opening", "rising", "choice", "echo", "reveal", "aftershock", "closing"]) {
    assert.equal(text.includes(raw), false, `instruction leaked raw phase ${raw}`);
  }
}

test("chapter reasoner keeps a new chapter in opening without leaking phase names", () => {
  const director = createEmptyDirectorState(0);
  const out = planChapterStep({
    director,
    signals: mkSignals({ nowTurn: 1 }),
    memoryEntries: [],
    nowTurn: 1,
  });
  assert.equal(out.chapter.chapterPhase, "opening");
  assertNoRawPhaseInstruction(out.writerInstruction);
  assert.equal(out.shouldPrepareClose, false);
});

test("chapter reasoner pushes a meaningful choice when structured progress stalls", () => {
  const director = createEmptyDirectorState(0);
  director.stallCount = 2;
  director.chapter = { ...director.chapter, startedTurn: 0, chapterPhase: "rising" };
  const out = planChapterStep({
    director,
    signals: mkSignals({ nowTurn: 4, stalled: true, effectiveProgressScore: 3 }),
    memoryEntries: [],
    nowTurn: 4,
  });
  assert.equal(out.chapter.chapterPhase, "choice");
  assertNoRawPhaseInstruction(out.writerInstruction);
});

test("chapter reasoner schedules echo after relationship or choice signals", () => {
  const director = createEmptyDirectorState(0);
  director.chapter = {
    ...director.chapter,
    startedTurn: 0,
    chapterPhase: "choice",
    keyChoiceIds: ["task_updates:t1"],
  };
  const out = planChapterStep({
    director,
    signals: mkSignals({
      nowTurn: 3,
      progressed: true,
      effectiveProgressScore: 28,
      relationshipUpdateCount: 1,
    }),
    memoryEntries: [mem({ id: "rel_1", kind: "relationship_shift", source: "relationship_update" })],
    nowTurn: 3,
  });
  assert.equal(out.chapter.chapterPhase, "echo");
  assert.deepEqual(out.chapter.echoedChoiceIds, ["task_updates:t1"]);
  assert.ok(out.mustEchoMemoryIds.includes("rel_1"));
});

test("chapter reasoner uses active hooks and secret fragments as reveal candidates", () => {
  const director = createEmptyDirectorState(0);
  director.chapter = { ...director.chapter, startedTurn: 0, chapterPhase: "rising" };
  const out = planChapterStep({
    director,
    signals: mkSignals({ nowTurn: 5, progressed: true, effectiveProgressScore: 24 }),
    memoryEntries: [
      mem({ id: "secret_1", kind: "secret_fragment", mergeKey: "secret:one", salience: 0.88 }),
    ],
    nowTurn: 5,
  });
  assert.equal(out.chapter.chapterPhase, "reveal");
  assert.ok(out.mustEchoMemoryIds.includes("secret_1"));
  assert.ok(out.chapter.forbiddenRevealIds.includes("secret_1"));
});

test("chapter reasoner leaves aftershock after a reveal under pressure", () => {
  const director = createEmptyDirectorState(0);
  director.chapter = { ...director.chapter, startedTurn: 0, chapterPhase: "reveal" };
  const out = planChapterStep({
    director,
    signals: mkSignals({
      nowTurn: 6,
      progressed: true,
      effectiveProgressScore: 30,
      highPressure: true,
      threatHot: true,
    }),
    memoryEntries: [],
    nowTurn: 6,
  });
  assert.equal(out.chapter.chapterPhase, "aftershock");
});

test("chapter reasoner closes only from a close candidate and prepares recap", () => {
  const director = createEmptyDirectorState(0);
  director.chapter = {
    ...director.chapter,
    startedTurn: 0,
    chapterPhase: "rising",
    closeCandidate: {
      shouldClose: true,
      confidence: 0.91,
      hasResolvedSmallQuestion: true,
      hasNewHook: true,
      hasPlayerChoiceEcho: true,
      hasReadablePause: true,
      hasNoLoreConflict: true,
      reason: "test",
      playerRecapCandidate: "recap",
      modelSummaryCandidate: "model",
      nextChapterTitleCandidate: "next",
    },
  };
  const out = planChapterStep({
    director,
    signals: mkSignals({ nowTurn: 6, progressed: true, effectiveProgressScore: 30 }),
    memoryEntries: [],
    nowTurn: 6,
  });
  assert.equal(out.chapter.chapterPhase, "closing");
  assert.equal(out.shouldPrepareClose, true);
  assertNoRawPhaseInstruction(out.writerInstruction);
});

test("chapter close decision rejects turn-count-only closure", () => {
  const director = createEmptyDirectorState(0);
  director.chapter = {
    ...director.chapter,
    startedTurn: 0,
    minTurns: 2,
    keyChoiceIds: ["turn:1:progress"],
    echoedChoiceIds: ["turn:1:progress"],
  };
  const decision = evaluateChapterCloseDecision({
    chapter: director.chapter,
    memoryEntries: [],
    directorPlan: mkPlan(),
    signals: mkSignals({ nowTurn: 6, progressed: true, effectiveProgressScore: 30 }),
    nowTurn: 6,
  });
  assert.equal(decision.shouldClose, false);
  assert.equal(decision.hasResolvedSmallQuestion, true);
  assert.equal(decision.hasNewHook, false);
});

test("chapter close decision rejects resolved question without a new hook", () => {
  const director = createEmptyDirectorState(0);
  director.chapter = {
    ...director.chapter,
    startedTurn: 0,
    minTurns: 2,
    keyChoiceIds: ["choice:door"],
    echoedChoiceIds: ["choice:door"],
  };
  const decision = evaluateChapterCloseDecision({
    chapter: director.chapter,
    memoryEntries: [
      mem({
        id: "resolved_question",
        kind: "promise",
        status: "resolved",
        chapterId: "chapter-1",
        chapterOrder: 1,
        chapterRole: "payoff",
        shouldAppearInRecap: true,
      }),
    ],
    directorPlan: mkPlan({ beatMode: "quiet" }),
    signals: mkSignals({ nowTurn: 5 }),
    nowTurn: 5,
  });
  assert.equal(decision.hasResolvedSmallQuestion, true);
  assert.equal(decision.hasNewHook, false);
  assert.equal(decision.shouldClose, false);
});

test("chapter close decision rejects new hook without a resolved small question", () => {
  const director = createEmptyDirectorState(0);
  director.chapter = {
    ...director.chapter,
    startedTurn: 0,
    minTurns: 2,
    keyChoiceIds: ["choice:door"],
    echoedChoiceIds: ["choice:door"],
  };
  const decision = evaluateChapterCloseDecision({
    chapter: director.chapter,
    memoryEntries: [
      mem({
        id: "new_hook",
        kind: "hook",
        status: "active",
        chapterId: "chapter-1",
        chapterOrder: 1,
        chapterRole: "hook",
        shouldAppearInRecap: true,
      }),
    ],
    directorPlan: mkPlan({ beatMode: "quiet" }),
    signals: mkSignals({ nowTurn: 5 }),
    nowTurn: 5,
  });
  assert.equal(decision.hasNewHook, true);
  assert.equal(decision.hasResolvedSmallQuestion, false);
  assert.equal(decision.shouldClose, false);
});

test("chapter close decision requires player choice echo, except first chapter with explicit intervention", () => {
  const entries = [
    mem({
      id: "resolved_question",
      kind: "promise",
      status: "resolved",
      chapterId: "chapter-1",
      chapterOrder: 1,
      chapterRole: "payoff",
      shouldAppearInRecap: true,
    }),
    mem({
      id: "new_hook",
      kind: "hook",
      status: "active",
      chapterId: "chapter-1",
      chapterOrder: 1,
      chapterRole: "hook",
      shouldAppearInRecap: true,
    }),
  ];
  const secondChapter = createEmptyDirectorState(0).chapter;
  const noEcho = evaluateChapterCloseDecision({
    chapter: { ...secondChapter, chapterOrder: 2, currentChapterId: "chapter-2", startedTurn: 0, minTurns: 2 },
    memoryEntries: entries.map((entry) => ({ ...entry, chapterId: "chapter-2", chapterOrder: 2 })),
    directorPlan: mkPlan({ beatMode: "quiet" }),
    signals: mkSignals({ nowTurn: 5 }),
    nowTurn: 5,
  });
  assert.equal(noEcho.hasPlayerChoiceEcho, false);
  assert.equal(noEcho.shouldClose, false);

  const firstWithoutIntervention = evaluateChapterCloseDecision({
    chapter: { ...createEmptyDirectorState(0).chapter, startedTurn: 0, minTurns: 2 },
    memoryEntries: entries,
    directorPlan: mkPlan({ beatMode: "quiet" }),
    signals: mkSignals({ nowTurn: 5 }),
    nowTurn: 5,
  });
  assert.equal(firstWithoutIntervention.hasPlayerChoiceEcho, false);
  assert.equal(firstWithoutIntervention.shouldClose, false);

  const firstWithIntervention = evaluateChapterCloseDecision({
    chapter: { ...createEmptyDirectorState(0).chapter, startedTurn: 0, minTurns: 2 },
    memoryEntries: entries,
    directorPlan: mkPlan({ beatMode: "quiet" }),
    signals: mkSignals({ nowTurn: 5, moved: true }),
    nowTurn: 5,
  });
  assert.equal(firstWithIntervention.hasPlayerChoiceEcho, true);
  assert.equal(firstWithIntervention.shouldClose, true);
});

test("chapter close decision accepts structured resolved question, hook, echo, pause, and clean lore", () => {
  const director = createEmptyDirectorState(0);
  director.chapter = {
    ...director.chapter,
    startedTurn: 0,
    minTurns: 2,
    keyChoiceIds: ["turn:2:progress"],
    echoedChoiceIds: ["turn:2:progress"],
  };
  const decision = evaluateChapterCloseDecision({
    chapter: director.chapter,
    memoryEntries: [
      mem({ id: "done", kind: "promise", status: "resolved", chapterId: "chapter-1", chapterOrder: 1, chapterRole: "payoff", shouldAppearInRecap: true }),
      mem({ id: "next", kind: "hook", status: "active", chapterId: "chapter-1", chapterOrder: 1, chapterRole: "hook", shouldAppearInRecap: true }),
    ],
    directorPlan: mkPlan({ beatMode: "aftershock" }),
    signals: mkSignals({
      nowTurn: 4,
      progressed: true,
      effectiveProgressScore: 30,
      terminalTaskDelta: 1,
    }),
    nowTurn: 4,
  });
  assert.equal(decision.shouldClose, true);
  assert.equal(decision.hasResolvedSmallQuestion, true);
  assert.equal(decision.hasNewHook, true);
  assert.equal(decision.hasPlayerChoiceEcho, true);
  assert.equal(decision.hasReadablePause, true);
  assert.equal(decision.hasNoLoreConflict, true);
  assert.ok(decision.confidence >= 0.75);
});

test("chapter reasoner update generates a next chapter seed after a valid close decision", () => {
  const director = createEmptyDirectorState(0);
  director.openHookCodes = ["next_hook"];
  director.recentPeakTurn = -99;
  director.chapter = {
    ...director.chapter,
    startedTurn: 0,
    minTurns: 1,
    targetTurns: [1, 3],
    softMaxTurns: 5,
    keyChoiceIds: ["first_intervention"],
  };
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
      mem({
        id: "resolved_question",
        kind: "promise",
        status: "resolved",
        chapterId: "chapter-1",
        chapterOrder: 1,
        chapterRole: "payoff",
        shouldAppearInRecap: true,
      }),
      mem({
        id: "next_hook",
        kind: "hook",
        status: "active",
        chapterId: "chapter-1",
        chapterOrder: 1,
        chapterRole: "hook",
        shouldAppearInRecap: true,
      }),
    ],
  } as any;

  const out = postTurnStoryDirectorUpdate({
    directorRaw: director,
    incidentQueueRaw: createEmptyIncidentQueue(),
    nowTurn: 3,
    pre: before,
    post: after,
    resolvedTurn: {
      task_updates: [{ id: "small_question", status: "completed" }],
      next_chapter_title_candidate: "潮湿门缝",
    },
  });

  assert.equal(out.director.chapter.closeCandidate?.shouldClose, true);
  assert.ok(out.director.chapter.nextChapterSeed);
  assert.equal(out.director.chapter.nextChapterSeed?.title, "潮湿门缝");
  assert.ok(out.director.chapter.nextChapterSeed?.inheritedThreadIds.includes("next_hook"));
});

test("chapter close decision rejects lore conflicts even when other checks pass", () => {
  const director = createEmptyDirectorState(0);
  director.chapter = {
    ...director.chapter,
    startedTurn: 0,
    minTurns: 2,
    keyChoiceIds: ["turn:2:progress"],
    echoedChoiceIds: ["turn:2:progress"],
  };
  const decision = evaluateChapterCloseDecision({
    chapter: director.chapter,
    memoryEntries: [
      mem({ id: "done", kind: "promise", status: "resolved", chapterId: "chapter-1", chapterOrder: 1, chapterRole: "payoff", shouldAppearInRecap: true }),
      mem({ id: "next", kind: "hook", status: "active", chapterId: "chapter-1", chapterOrder: 1, chapterRole: "hook", shouldAppearInRecap: true }),
    ],
    directorPlan: mkPlan(),
    signals: mkSignals({
      nowTurn: 4,
      progressed: true,
      effectiveProgressScore: 30,
      terminalTaskDelta: 1,
      loreConflict: true,
    }),
    nowTurn: 4,
  });
  assert.equal(decision.hasNoLoreConflict, false);
  assert.equal(decision.shouldClose, false);
});
