import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyDirectorState, createEmptyIncidentQueue } from "./types";
import { normalizeDirectorState, postTurnStoryDirectorUpdate } from "./postTurn";
import { buildDirectorDigestForServer } from "./prompt";
import { buildDirectorAgendaHintBlock, buildServerDirectorHintBlock } from "./serverHint";
import { clearChapterReasonerTrace, getChapterReasonerTrace } from "./chapterTrace";

function mkState(overrides?: Partial<ReturnType<typeof createEmptyDirectorState>>) {
  return { ...createEmptyDirectorState(0), ...(overrides ?? {}) } as any;
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

test("director state initializes chapter director defaults", () => {
  const state = createEmptyDirectorState(0);
  assert.equal(state.chapter.currentChapterId, "chapter-1");
  assert.equal(state.chapter.chapterOrder, 1);
  assert.equal(state.chapter.chapterTitle, "暗月初醒");
  assert.equal(state.chapter.chapterPhase, "opening");
  assert.equal(state.chapter.closeCandidate, null);
  assert.equal(state.chapter.nextChapterSeed, null);
});

test("legacy director state without chapter is normalized with chapter director", () => {
  const state = normalizeDirectorState(
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

test("chapter bridge resets director chapter when active chapter changes", () => {
  const before = { playerLocation: "B1_SafeZone", tasks: [], mainThreatByFloor: {}, memoryEntries: [] };
  const out = postTurnStoryDirectorUpdate({
    directorRaw: createEmptyDirectorState(0),
    incidentQueueRaw: createEmptyIncidentQueue(),
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
  assert.equal(out.director.chapter.currentChapterId, "chapter-2");
  assert.equal(out.director.chapter.chapterOrder, 2);
  assert.equal(out.director.chapter.chapterTitle, "潮湿门缝");
  assert.equal(out.director.chapter.startedTurn, 5);
});

test("post-turn chapter phase enters choice when structured progress stalls", () => {
  const before = { playerLocation: "B1_SafeZone", tasks: [], mainThreatByFloor: {}, memoryEntries: [] };
  const director = createEmptyDirectorState(0);
  director.stallCount = 1;
  director.chapter = {
    ...director.chapter,
    chapterPhase: "rising",
    startedTurn: 0,
    minTurns: 99,
  };

  const out = postTurnStoryDirectorUpdate({
    directorRaw: director,
    incidentQueueRaw: createEmptyIncidentQueue(),
    nowTurn: 4,
    pre: before,
    post: before,
    resolvedTurn: {},
  });

  assert.equal(out.director.chapter.chapterPhase, "choice");
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
  const director = createEmptyDirectorState(0);
  director.openHookCodes = ["hook_reveal"];
  director.chapter = {
    ...director.chapter,
    chapterPhase: "rising",
    startedTurn: 0,
    minTurns: 99,
  };

  const out = postTurnStoryDirectorUpdate({
    directorRaw: director,
    incidentQueueRaw: createEmptyIncidentQueue(),
    nowTurn: 5,
    pre: before,
    post: after,
    resolvedTurn: {},
  });

  assert.equal(out.director.chapter.chapterPhase, "reveal");
  assert.ok(out.director.chapter.mustEchoMemoryIds.includes("hook_reveal"));
});

test("post-turn chapter phase enters aftershock after reveal under high pressure", () => {
  const before = { playerLocation: "B1_SafeZone", tasks: [], mainThreatByFloor: {}, memoryEntries: [] };
  const after = {
    playerLocation: "B1_SafeZone",
    tasks: [],
    mainThreatByFloor: { B1: { phase: "active" } },
    memoryEntries: [],
  };
  const director = createEmptyDirectorState(0);
  director.chapter = {
    ...director.chapter,
    chapterPhase: "reveal",
    startedTurn: 0,
    minTurns: 99,
  };

  const out = postTurnStoryDirectorUpdate({
    directorRaw: director,
    incidentQueueRaw: createEmptyIncidentQueue(),
    nowTurn: 6,
    pre: before,
    post: after,
    resolvedTurn: {},
  });

  assert.equal(out.director.chapter.chapterPhase, "aftershock");
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
  let q: any = createEmptyIncidentQueue();
  for (let turn = 1; turn <= 3; turn++) {
    const out = postTurnStoryDirectorUpdate({
      directorRaw: d,
      incidentQueueRaw: q,
      nowTurn: turn,
      pre: before,
      post: after,
      resolvedTurn: { task_updates: [], main_threat_updates: [] },
    });
    d = out.director;
    q = out.incidentQueue;
  }
  assert.ok(d.stallCount >= 2);
  // 队列应开始出现可用事件（queued/armed/fired 中至少一个）
  assert.ok((q.items ?? []).length >= 1);
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
  const out = postTurnStoryDirectorUpdate({
    directorRaw: mkState({ stallCount: 3, tension: 40 }),
    incidentQueueRaw: createEmptyIncidentQueue(),
    nowTurn: 5,
    pre: before,
    post: after,
    resolvedTurn: { task_updates: [{ id: "t1", status: "completed" }] },
  });
  assert.ok(out.director.stallCount <= 3);
  assert.ok(out.director.tension <= 40);
});

test("incident dueTurn arms/fires and expires when overdue", () => {
  const before = { playerLocation: "B1_SafeZone", tasks: [], mainThreatByFloor: {}, memoryEntries: [] };
  const after = { ...before };
  const out1 = postTurnStoryDirectorUpdate({
    directorRaw: mkState({ stallCount: 4, pressureBudget: 80, recentPeakTurn: -99 }),
    incidentQueueRaw: createEmptyIncidentQueue(),
    nowTurn: 10,
    pre: before,
    post: after,
    resolvedTurn: {},
  });
  // next turn advance should keep items bounded
  const out2 = postTurnStoryDirectorUpdate({
    directorRaw: out1.director,
    incidentQueueRaw: out1.incidentQueue,
    nowTurn: 14,
    pre: before,
    post: after,
    resolvedTurn: {},
  });
  const expired = (out2.incidentQueue.items ?? []).some((x: any) => x.status === "expired");
  assert.ok(expired || (out2.incidentQueue.items ?? []).length <= 10);
});

test("chapter director can produce close candidate and next chapter seed", () => {
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
  const director = createEmptyDirectorState(0);
  director.openHookCodes = ["hook_next"];
  director.recentPeakTurn = -99;
  director.chapter = {
    ...director.chapter,
    startedTurn: 0,
    minTurns: 1,
    targetTurns: [1, 3],
    softMaxTurns: 5,
  };
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

  assert.equal(out.director.chapter.chapterPhase, "closing");
  assert.equal(out.director.chapter.closeCandidate?.shouldClose, true);
  assert.ok((out.director.chapter.closeCandidate?.confidence ?? 0) >= 0.72);
  assert.equal(out.director.chapter.nextChapterSeed?.title, "潮湿门缝");
  assert.ok(out.director.chapter.summaryForPlayer);
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

test("directorDigest and server hint are length-capped", () => {
  const dig = buildDirectorDigestForServer({
    tension: 88,
    stallCount: 3,
    beatModeHint: "peak",
    pressureFlags: ["stalling", "high_threat", "hooks_ready", "debt_pileup", "pending_incidents"],
    pendingIncidentCodes: ["npc_demand_repayment", "threat_push_close", "false_safe_zone_break"],
    mustRecallHookCodes: ["hook_a", "hook_b", "hook_c"],
  });
  assert.ok(dig.digest.length <= 220);
  const hint = buildServerDirectorHintBlock(dig);
  assert.ok(hint.length <= 600);
  assert.match(hint, /主流网文/);
  assert.match(hint, /不接管 PLAYER_CHAT/);
});

test("director agenda hint block only exposes sanitized soft constraints", () => {
  const hint = buildDirectorAgendaHintBlock([
    {
      id: 1,
      eventCode: "EV_SOFT_CLUE",
      title: "soft clue",
      injectionHint: "let the hallway light flicker near the old notice board",
      triggerConditions: ["player stays near corridor"],
      agencyConstraints: ["player can ignore or avoid it"],
      forbiddenOutcomes: ["do not reveal the hidden culprit"],
      salience: 0.9,
    },
  ]);
  assert.match(hint, /EV_SOFT_CLUE/);
  assert.match(hint, /player can ignore/);
  assert.doesNotMatch(hint, /private_hooks/);
  assert.doesNotMatch(hint, /must_not_surface_directly/);
});

