import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshotSummary, canCreateManualBranch, normalizeSaveSlotMeta } from "./branch";

test("buildSnapshotSummary extracts key fields", () => {
  const summary = buildSnapshotSummary({
    day: 2,
    hour: 8,
    playerLocation: "B1_SafeZone",
    activeTasksCount: 3,
    mainThreatByFloor: {
      "1": {
        floorId: "1",
        threatId: "A-001",
        phase: "active",
        suppressionProgress: 25,
        lastResolvedAtHour: null,
        counterHintsUsed: [],
      },
    },
    dynamicNpcStates: { "N-001": { currentLocation: "1F_Lobby", isAlive: false } },
    reviveContext: {
      pending: true,
      deathLocation: "1F_Lobby",
      deathCause: "test",
      droppedLootLedger: [],
      droppedLootOwnerLedger: [],
    },
  });
  assert.equal(summary.day, 2);
  assert.equal(summary.activeTasksCount, 3);
  assert.equal(summary.revivePending, true);
  assert.equal(summary.keyThreatStates.length, 1);
});

test("manual branch requires safe zone", () => {
  const blocked = canCreateManualBranch({
    playerLocation: "4F_Room401",
    revivePending: false,
    isAlive: true,
    anchorUnlocks: { B1: true, "1": true, "7": false },
    currentFloorThreat: null,
  });
  assert.equal(blocked.ok, false);
  const ok = canCreateManualBranch({
    playerLocation: "B1_SafeZone",
    revivePending: false,
    isAlive: true,
    anchorUnlocks: { B1: true, "1": true, "7": false },
    currentFloorThreat: { floorId: "B1", threatId: "A-000", phase: "idle", suppressionProgress: 0, lastResolvedAtHour: null, counterHintsUsed: [] },
  });
  assert.equal(ok.ok, true);
});

test("normalizeSaveSlotMeta keeps branch metadata stable", () => {
  const meta = normalizeSaveSlotMeta(
    {
      slotId: "branch_1",
      label: "分叉一",
      kind: "branch",
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T01:00:00.000Z",
      runId: "run_1",
      parentSlotId: "main_slot",
      branchFromDecisionId: "D-001",
    },
    {
      slotId: "branch_1",
      label: "分叉一",
      kind: "branch",
      createdAt: "2026-03-24T00:00:00.000Z",
      runId: "run_1",
      parentSlotId: "main_slot",
      branchFromDecisionId: "D-001",
      snapshotSummary: buildSnapshotSummary({
        day: 1,
        hour: 1,
        playerLocation: "B1_SafeZone",
        activeTasksCount: 0,
        mainThreatByFloor: {},
        dynamicNpcStates: {},
        reviveContext: undefined,
      }),
    }
  );
  assert.equal(meta.slotId, "branch_1");
  assert.equal(meta.kind, "branch");
  assert.equal(meta.parentSlotId, "main_slot");
  assert.equal(meta.branchFromDecisionId, "D-001");
});
