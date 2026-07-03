// src/lib/ai/stream/sanitize.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeMessagesForUpstream } from "@/lib/ai/stream/sanitize";

test("sanitizeMessagesForUpstream 剥离 vendor-only 字段，仅保留 role+content", () => {
  const out = sanitizeMessagesForUpstream([
    { role: "system", content: "s" },
    { role: "assistant", content: "a", reasoning_content: "SECRET" } as { role: string; content: unknown },
    { role: "user", content: 42 },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { role: "system", content: "s" });
  assert.equal("reasoning_content" in out[1], false);
  assert.equal(out[1].content, "a");
});

test("sanitizeMessagesForUpstream 保留合法的 assistant toolCalls 与 tool toolCallId", () => {
  const out = sanitizeMessagesForUpstream([
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "c1", type: "function", function: { name: "f", arguments: '{"a":1}' } }],
    } as { role: string; content: unknown },
    { role: "tool", content: '{"ok":true}', tool_call_id: "c1" } as { role: string; content: unknown },
  ]);
  assert.equal(out[0].toolCalls?.length, 1);
  assert.equal(out[0].toolCalls?.[0].id, "c1");
  assert.equal(out[1].toolCallId, "c1");
});

test("sanitizeMessagesForUpstream 丢弃畸形 toolCalls 且不跨角色泄漏", () => {
  const out = sanitizeMessagesForUpstream([
    {
      role: "user",
      content: "u",
      toolCalls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }],
    } as { role: string; content: unknown },
    {
      role: "assistant",
      content: "a",
      toolCalls: [{ id: "", function: { name: "" } }, "junk"],
    } as { role: string; content: unknown },
  ]);
  // user 角色不允许携带 toolCalls
  assert.equal(out[0].toolCalls, undefined);
  // 全部畸形 → 不写 toolCalls 字段
  assert.equal(out[1].toolCalls, undefined);
});
