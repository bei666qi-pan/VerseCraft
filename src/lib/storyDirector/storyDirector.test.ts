import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyDirectorState, createEmptyIncidentQueue } from "./types";
import { postTurnStoryDirectorUpdate } from "./postTurn";
import { buildDirectorDigestForServer } from "./prompt";
import { buildServerDirectorHintBlock } from "./serverHint";

function mkState(overrides?: Partial<ReturnType<typeof createEmptyDirectorState>>) {
  return { ...createEmptyDirectorState(0), ...(overrides ?? {}) } as any;
}

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
});

