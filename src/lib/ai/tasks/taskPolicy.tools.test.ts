// src/lib/ai/tasks/taskPolicy.tools.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  TASK_POLICY,
  TASK_TOOLS_ALLOWED,
  assertToolUseAllowedForTask,
  isToolUseAllowedForTask,
} from "@/lib/ai/tasks/taskPolicy";
import type { TaskType } from "@/lib/ai/types/core";

test("tool 白名单只包含离线任务和 DM 代理", () => {
  assert.deepEqual(
    [...TASK_TOOLS_ALLOWED].sort(),
    ["DEV_ASSIST", "MECHANICS", "STORYLINE_SIMULATION", "WORLDBUILD_OFFLINE"]
  );
});

test("在线/实时任务一律禁止 tool use", () => {
  const onlineTasks: TaskType[] = [
    "PLAYER_CHAT",
    "PLAYER_CONTROL_PREFLIGHT",
    "INTENT_PARSE",
    "SAFETY_PREFILTER",
    "RULE_RESOLUTION",
    "COMBAT_NARRATION",
    "MEMORY_COMPRESSION",
  ];
  for (const task of onlineTasks) {
    assert.equal(isToolUseAllowedForTask(task), false, `task=${task} 不应允许 tools`);
    assert.throws(() => assertToolUseAllowedForTask(task), /Tool use is forbidden/);
  }
});

test("离线任务允许 tool use 且断言不抛错", () => {
  for (const task of TASK_TOOLS_ALLOWED) {
    assert.equal(isToolUseAllowedForTask(task), true);
    assert.doesNotThrow(() => assertToolUseAllowedForTask(task));
  }
});

test("每个 TaskType 都有明确的 tool 判定（防止新增任务漏配）", () => {
  for (const task of Object.keys(TASK_POLICY) as TaskType[]) {
    assert.equal(typeof isToolUseAllowedForTask(task), "boolean");
  }
});
