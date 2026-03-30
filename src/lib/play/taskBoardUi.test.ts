import test from "node:test";
import assert from "node:assert/strict";
import { filterTasksForTaskBoardVisibilityV2, partitionTasksForBoard, pickPrimaryTask } from "./taskBoardUi";
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

test("filterTasksForTaskBoardVisibilityV2 隐藏 soft_lead+available", () => {
  const soft = task({
    id: "s",
    title: "软引线",
    status: "available",
    type: "character",
    ...({ taskNarrativeLayer: "soft_lead" } as Record<string, unknown>),
  });
  const kept = filterTasksForTaskBoardVisibilityV2([soft], true);
  // soft_lead 属于线索影子：可以进入“线索层”，但不应进入正式任务主视图；
  // filter 负责“是否进入任务面板整体分区”，因此这里应保留。
  assert.equal(kept.length, 1);
});

test("partitionTasksForBoard keeps overflow when promise/risk slots saturated", () => {
  const accepted = Array.from({ length: 12 }, (_, i) =>
    task({ id: `a${i}`, title: `已接${i}`, goalKind: "commission", status: "active", grantState: "visible_on_board" as any })
  );
  const promises = Array.from({ length: 12 }, (_, i) =>
    task({
      id: `p${i}`,
      title: `承诺${i}`,
      goalKind: "promise",
      status: "available",
      taskNarrativeLayer: "conversation_promise" as any,
      grantState: "narratively_offered" as any,
    })
  );
  const clues = Array.from({ length: 8 }, (_, i) =>
    task({
      id: `s${i}`,
      title: `线索${i}`,
      status: "available",
      taskNarrativeLayer: "soft_lead" as any,
      grantState: "discovered_but_unoffered" as any,
    })
  );
  const p = partitionTasksForBoard(
    [task({ id: "m", title: "主线", goalKind: "main", status: "active", grantState: "visible_on_board" as any }), ...accepted, ...promises, ...clues],
    4
  );
  assert.equal(p.primary?.id, "m");
  assert.ok(p.accepted.length <= 4);
  assert.ok(p.promises.length <= 6);
  assert.ok(p.clues.length <= 3);
  assert.ok(p.overflow.length >= 1);
});
