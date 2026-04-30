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

test("formal active tasks are not board-visible until accepted or explicitly visible", () => {
  assert.equal(getTaskVisibilityTier(task({ id: "ordinary_formal" })), "hidden");
  assert.equal(
    getTaskVisibilityTier(task({ id: "accepted_formal", grantState: "accepted_in_story" })),
    "board_visible"
  );
  assert.equal(
    getTaskVisibilityTier(task({ id: "explicit_formal", grantState: "visible_on_board" })),
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
