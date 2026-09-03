import assert from "node:assert/strict";
import test from "node:test";

import type { CommitTurnResult } from "./commitTurn";
import { createTurnFinalizer, type TurnFinalizationInput } from "./turnFinalizer";

const input = {
  requestId: "request-1",
  sessionId: "session-1",
  worldId: "dark_moon_prologue" as const,
  mapId: "dark_moon",
  turnIndex: 7,
  lane: "mechanics" as const,
  candidateDmRecord: { narrative: "done", awarded_items: [{ id: "I-A01" }] },
  delta: {
    isActionLegal: true,
    illegalReasons: [] as const,
    consumesTime: true,
    sanityDamage: 0,
    isDeath: false,
    npcLocationUpdates: [],
    npcAttitudeUpdates: [],
    taskUpdates: [],
    newTasks: [],
    mustDegrade: false,
  },
  validatorReport: {
    ok: true,
    issues: [],
    narrativeOverride: null,
    optionsOverride: null,
    telemetry: {
      totalIssues: 0,
      byCode: {},
      safeNarrativeFallbackApplied: false,
      narrativeGovernanceFinalSafe: true,
    },
  },
} as unknown as TurnFinalizationInput;

test("concurrent duplicate finalization commits, emits FINAL and enqueues exactly once", async () => {
  let commits = 0;
  let finals = 0;
  let jobs = 0;
  const commit = (): CommitTurnResult => {
    commits += 1;
    return {
      committedDmRecord: { narrative: "committed" },
      summary: { commitFlags: [] } as unknown as CommitTurnResult["summary"],
    };
  };
  const finalizer = createTurnFinalizer({
    commit,
    emitFinal: async () => { finals += 1; },
    enqueueDirector: async () => { jobs += 1; },
  });

  const [first, replay] = await Promise.all([finalizer.finalize(input), finalizer.finalize(input)]);

  assert.equal(commits, 1);
  assert.equal(finals, 1);
  assert.equal(jobs, 1);
  assert.equal(first.receipt.id, replay.receipt.id);
});

test("a failed commit cannot emit FINAL or enqueue a Director job", async () => {
  let finals = 0;
  let jobs = 0;
  const finalizer = createTurnFinalizer({
    commit: () => { throw new Error("commit failed"); },
    emitFinal: async () => { finals += 1; },
    enqueueDirector: async () => { jobs += 1; },
  });

  await assert.rejects(finalizer.finalize(input), /commit failed/);
  assert.equal(finals, 0);
  assert.equal(jobs, 0);
});

test("prepared commit stays private until the same finalizer publishes it", async () => {
  let finals = 0;
  let jobs = 0;
  const finalizer = createTurnFinalizer({
    commit: () => ({
      committedDmRecord: { narrative: "committed" },
      summary: { commitFlags: [] } as unknown as CommitTurnResult["summary"],
    }),
    emitFinal: async () => { finals += 1; },
    enqueueDirector: async () => { jobs += 1; },
  });

  const prepared = finalizer.prepare(input);
  assert.equal(finals, 0);
  assert.equal(jobs, 0);

  const first = await finalizer.publish(prepared, { narrative: "post-processed" });
  const replay = await finalizer.publish(prepared, { narrative: "ignored replay" });

  assert.equal(finals, 1);
  assert.equal(jobs, 1);
  assert.deepEqual(first.committedDmRecord, { narrative: "post-processed" });
  assert.equal(first.receipt.id, replay.receipt.id);
});
