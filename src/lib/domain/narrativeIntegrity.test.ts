import test from "node:test";
import assert from "node:assert/strict";
import type { ClueEntry } from "@/lib/domain/narrativeDomain";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import { checkNarrativeCrossRefs, repairNarrativeCrossRefs } from "@/lib/domain/narrativeIntegrity";

const clue = (over: Partial<ClueEntry>): ClueEntry => ({
  id: "c1",
  title: "t",
  detail: "d",
  kind: "rumor",
  status: "unknown",
  source: "dm",
  visibility: "shown",
  importance: 2,
  relatedNpcIds: [],
  relatedLocationIds: [],
  relatedItemIds: [],
  relatedObjectiveId: null,
  acquisitionSource: "dm",
  triggerSource: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const task = (over: Partial<GameTaskV2>): GameTaskV2 =>
  ({
    id: "T1",
    title: "任务",
    desc: "d",
    type: "floor",
    issuerId: "N-001",
    issuerName: "某人",
    floorTier: "B1",
    guidanceLevel: "light",
    reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
    status: "active",
    expiresAt: null,
    betrayalPossible: false,
    hiddenOutcome: "",
    hiddenTriggerConditions: [],
    claimMode: "auto",
    npcProactiveGrant: { enabled: false, npcId: "", minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
    npcProactiveGrantLastIssuedHour: null,
    nextHint: "",
    worldConsequences: [],
    highRiskHighReward: false,
    ...over,
  }) as GameTaskV2;

test("repairNarrativeCrossRefs: prunes requiredItemIds not in registry and not held", () => {
  const t0 = task({
    id: "tx",
    requiredItemIds: ["NOPE_UNHELD", "I-A01"],
  });
  const { tasks, report } = repairNarrativeCrossRefs({
    tasks: [t0],
    clues: [],
    inventoryItemIds: [],
    warehouseItemIds: [],
  });
  assert.ok(report.issues.some((i) => i.kind === "task_pruned_required_item"));
  assert.deepEqual(tasks[0].requiredItemIds, ["I-A01"]);
});

test("repairNarrativeCrossRefs: keeps custom id when held", () => {
  const t0 = task({ id: "tx", requiredItemIds: ["CUSTOM_X"] });
  const { tasks, report } = repairNarrativeCrossRefs({
    tasks: [t0],
    clues: [],
    inventoryItemIds: ["CUSTOM_X"],
    warehouseItemIds: [],
  });
  assert.equal(report.issues.length, 0);
  assert.deepEqual(tasks[0].requiredItemIds, ["CUSTOM_X"]);
});

test("repairNarrativeCrossRefs: clears relatedObjectiveId when task missing", () => {
  const { clues, report } = repairNarrativeCrossRefs({
    tasks: [],
    clues: [clue({ id: "c2", relatedObjectiveId: "ghost" })],
    inventoryItemIds: [],
    warehouseItemIds: [],
  });
  assert.ok(report.issues.some((i) => i.kind === "clue_cleared_missing_objective"));
  assert.equal(clues[0].relatedObjectiveId, null);
});

test("repairNarrativeCrossRefs: clears maturesToObjectiveId when target task terminal", () => {
  const tk = task({ id: "T-done", status: "completed" });
  const { clues, report } = repairNarrativeCrossRefs({
    tasks: [tk],
    clues: [clue({ id: "c3", maturesToObjectiveId: "T-done" })],
    inventoryItemIds: [],
    warehouseItemIds: [],
  });
  assert.ok(report.issues.some((i) => i.kind === "clue_cleared_stale_mature_objective"));
  assert.equal(clues[0].maturesToObjectiveId, undefined);
});

test("checkNarrativeCrossRefs matches repair issue kinds", () => {
  const rep = checkNarrativeCrossRefs({
    tasks: [task({ id: "x", requiredItemIds: ["ZZZ_NONE"] })],
    clues: [clue({ relatedObjectiveId: "nope" })],
    inventoryItemIds: [],
    warehouseItemIds: [],
  });
  const kinds = new Set(rep.issues.map((i) => i.kind));
  assert.ok(kinds.has("task_pruned_required_item"));
  assert.ok(kinds.has("clue_cleared_missing_objective"));
});
