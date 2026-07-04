import test from "node:test";
import assert from "node:assert/strict";
import { createStageOneStarterTasks } from "@/lib/tasks/taskV2";
import { WORLD_CLOSURE_BY_FLOOR } from "@/lib/registry/worldClosureMatrix";
import {
  ESCAPE_COST_TRIAL_TASK_IDS,
  ESCAPE_EXIT_FLOOR_ID,
  ESCAPE_GATEKEEPER_FLOOR_ID,
  ESCAPE_GATEKEEPER_NPC_IDS,
  ESCAPE_KEY_ITEM_ID,
  getEscapeClosureBindingIssues,
} from "./closureBinding";

test("closureBinding: escape 条件与 WORLD_CLOSURE_MATRIX 保持一致（回归漂移检测）", () => {
  const issues = getEscapeClosureBindingIssues();
  assert.deepStrictEqual(issues, []);
});

test("closureBinding: 守门人楼层与出口楼层在矩阵中真实存在", () => {
  assert.ok(WORLD_CLOSURE_BY_FLOOR[ESCAPE_GATEKEEPER_FLOOR_ID]);
  assert.ok(WORLD_CLOSURE_BY_FLOOR[ESCAPE_EXIT_FLOOR_ID]);
  for (const npcId of ESCAPE_GATEKEEPER_NPC_IDS) {
    assert.ok(WORLD_CLOSURE_BY_FLOOR[ESCAPE_GATEKEEPER_FLOOR_ID].keyNpcIds.includes(npcId), npcId);
  }
  assert.ok(WORLD_CLOSURE_BY_FLOOR[ESCAPE_GATEKEEPER_FLOOR_ID].itemIds.includes(ESCAPE_KEY_ITEM_ID));
});

test("closureBinding: 代价试炼任务 id 在真实任务表中存在（未来若改名会在此处失败）", () => {
  const tasks = createStageOneStarterTasks();
  const ids = new Set(tasks.map((t) => t.id));
  for (const id of ESCAPE_COST_TRIAL_TASK_IDS) {
    assert.ok(ids.has(id), `任务 id ${id} 应存在于 createStageOneStarterTasks()`);
  }
});
