// src/lib/ai/gateway/openaiCompatible.tools.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { openaiCompatibleGateway } from "@/lib/ai/gateway/openaiCompatible";
import type { NormalizedCompletionRequest } from "@/lib/ai/providers/types";
import type { ToolDefinition } from "@/lib/ai/types/core";

const TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "search_world_facts",
    description: "检索世界事实",
    parameters: { type: "object", properties: { contains: { type: "string" } } },
  },
};

function baseBody(partial: Partial<NormalizedCompletionRequest>): NormalizedCompletionRequest {
  return {
    modelApiName: "m",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
    maxTokens: 100,
    ...partial,
  };
}

function parsePayload(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

test("buildInit: tools + tool_choice 进入请求体", () => {
  const payload = parsePayload(
    openaiCompatibleGateway.buildInit("k", baseBody({ tools: [TOOL], toolChoice: "auto" }))
  );
  assert.deepEqual(payload.tools, [TOOL]);
  assert.equal(payload.tool_choice, "auto");
});

test("buildInit: 无 tools 时请求体不出现 tools/tool_choice 键", () => {
  const payload = parsePayload(openaiCompatibleGateway.buildInit("k", baseBody({})));
  assert.equal("tools" in payload, false);
  assert.equal("tool_choice" in payload, false);
});

test("buildInit: assistant toolCalls / tool toolCallId 序列化为 snake_case wire 格式", () => {
  const payload = parsePayload(
    openaiCompatibleGateway.buildInit(
      "k",
      baseBody({
        messages: [
          { role: "user", content: "u" },
          {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }],
          },
          { role: "tool", content: '{"ok":true}', toolCallId: "c1" },
        ],
      })
    )
  );
  const messages = payload.messages as Array<Record<string, unknown>>;
  assert.equal(messages.length, 3);
  assert.equal("toolCalls" in messages[1], false);
  assert.deepEqual(messages[1].tool_calls, [
    { id: "c1", type: "function", function: { name: "f", arguments: "{}" } },
  ]);
  assert.equal("toolCallId" in messages[2], false);
  assert.equal(messages[2].tool_call_id, "c1");
  // 非 tool 角色不带 tool 字段
  assert.equal("tool_calls" in messages[0], false);
});

test("buildInit: extraBody 不能覆盖 tools / tool_choice 保留键", () => {
  const payload = parsePayload(
    openaiCompatibleGateway.buildInit(
      "k",
      baseBody({
        tools: [TOOL],
        toolChoice: "none",
        extraBody: { tools: "EVIL", tool_choice: "EVIL", custom_flag: 1 },
      })
    )
  );
  assert.deepEqual(payload.tools, [TOOL]);
  assert.equal(payload.tool_choice, "none");
  assert.equal(payload.custom_flag, 1);
});
