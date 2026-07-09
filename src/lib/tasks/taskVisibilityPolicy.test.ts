import assert from "node:assert/strict";
import test from "node:test";
import { getTaskVisibilityTier } from "./taskVisibilityPolicy";
import type { GameTaskV2 } from "./taskV2";

function task(overrides: Partial<GameTaskV2>): GameTaskV2 {
  return {
    id: "t",
    title: "task",
    desc: "",
    type: "floor",
    status: "active",
    guidanceLevel: "none",
    goalKind: "commission",
    shouldBeFormalTask: true,
    reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
    ...overrides,
  } as GameTaskV2;
}

test("formal active tasks are board-visible regardless of grantState", () => {
  // Phase 2 重构后：visible 性纯从 status 与 narrativeLayer 派生，不再依赖 grantState
  assert.equal(
    getTaskVisibilityTier(task({ id: "ordinary_formal" })),
    "board_visible"
  );
  // 即使 unavailable 状态的 formal 任务也应可见（可接但未激活）
  assert.equal(
    getTaskVisibilityTier(task({ id: "available_formal", status: "available" })),
    "board_visible"
  );
});

test("starter escape spine stays visible as the onboarding whitelist", () => {
  assert.equal(
    getTaskVisibilityTier(task({ id: "main_escape_spine", goalKind: "main", type: "main" })),
    "board_visible"
  );
});

test("soft leads are clue-only instead of board tasks", () => {
  assert.equal(
    getTaskVisibilityTier(
      task({
        id: "rumor",
        shouldBeFormalTask: false,
        shouldStayAsSoftLead: true,
        taskNarrativeLayer: "soft_lead",
      })
    ),
    "clue_only"
  );
});
