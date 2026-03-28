import test from "node:test";
import assert from "node:assert/strict";
import { partitionTasksForBoard, pickPrimaryTask } from "./taskBoardUi";
import type { GameTask } from "@/store/useGameStore";

const task = (over: Partial<GameTask> & Pick<GameTask, "id" | "title">): GameTask =>
  ({
    desc: "",
    type: "floor",
    issuerId: "N-1",
    issuerName: "x",
    floorTier: "1",
    guidanceLevel: "none",
    reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
    status: "active",
    expiresAt: null,
    betrayalPossible: false,
    hiddenOutcome: "",
    hiddenTriggerConditions: [],
    claimMode: "auto",
    npcProactiveGrant: {
      enabled: false,
      npcId: "",
      minFavorability: 0,
      preferredLocations: [],
      cooldownHours: 0,
    },
    npcProactiveGrantLastIssuedHour: null,
    nextHint: "",
    worldConsequences: [],
    highRiskHighReward: false,
    ...over,
  }) as GameTask;

test("pickPrimaryTask prefers main goalKind", () => {
  const primary = pickPrimaryTask([
    task({ id: "a", title: "side", goalKind: "commission", guidanceLevel: "strong" }),
    task({ id: "b", title: "main", goalKind: "main", guidanceLevel: "none" }),
  ]);
  assert.equal(primary?.id, "b");
});

test("partitionTasksForBoard keeps overflow when promise/risk slots saturated", () => {
  const commissions = Array.from({ length: 12 }, (_, i) =>
    task({ id: `c${i}`, title: `委托${i}`, goalKind: "commission" })
  );
  const p = partitionTasksForBoard([task({ id: "m", title: "主线", goalKind: "main" }), ...commissions], 4);
  assert.equal(p.primary?.id, "m");
  assert.ok(p.paths.length <= 4);
  assert.ok(p.promiseRisk.length <= 6);
  assert.ok(p.overflow.length >= 1);
});
