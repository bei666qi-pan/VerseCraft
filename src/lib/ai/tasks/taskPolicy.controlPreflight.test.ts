import test from "node:test";
import assert from "node:assert/strict";
import { TASK_POLICY } from "@/lib/ai/tasks/taskPolicy";

test("PLAYER_CONTROL_PREFLIGHT 不再 fallback 到 main（链路必须短）", () => {
  const b = TASK_POLICY.PLAYER_CONTROL_PREFLIGHT;
  assert.deepEqual(b.fallbackRoles, []);
});

test("PLAYER_CONTROL_PREFLIGHT 为快判任务：短 token + 短超时 + 低温", () => {
  const b = TASK_POLICY.PLAYER_CONTROL_PREFLIGHT;
  assert.equal(b.stream, false);
  assert.equal(b.temperature, 0);
  assert.equal(b.maxTokens, 192);
  assert.equal(b.timeoutMs, 6000);
});

