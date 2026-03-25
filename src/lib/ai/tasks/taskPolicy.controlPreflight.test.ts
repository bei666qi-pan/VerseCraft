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
  assert.ok(b.maxTokens > 0 && b.maxTokens <= 256, `maxTokens too large: ${b.maxTokens}`);
  assert.ok(b.timeoutMs > 0 && b.timeoutMs <= 8000, `timeoutMs too large: ${b.timeoutMs}`);
});

