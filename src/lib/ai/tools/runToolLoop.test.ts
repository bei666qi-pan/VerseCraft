// src/lib/ai/tools/runToolLoop.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { runToolLoop, type ExecuteChatCompletionFn, type ToolRegistry } from "@/lib/ai/tools/runToolLoop";
import type { AIResponse } from "@/lib/ai/types";
import type { ChatMessage, ToolCall } from "@/lib/ai/types/core";

const CTX = { requestId: "req-test", userId: "u1", sessionId: "s1", path: "/test" };

function okResponse(partial: Partial<AIResponse>): AIResponse {
  return {
    ok: true,
    providerId: "oneapi",
    logicalRole: "reasoner",
    content: "",
    usage: null,
    latencyMs: 1,
    ...partial,
  };
}

function toolCall(id: string, name: string, args: unknown): ToolCall {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

function makeRegistry(overrides?: Partial<ToolRegistry>): ToolRegistry {
  return {
    echo: {
      definition: {
        type: "function",
        function: { name: "echo", description: "echo back", parameters: { type: "object", properties: {} } },
      },
      handler: async (args) => ({ ok: true, echoed: args }),
    },
    ...overrides,
  };
}

test("runToolLoop: 一轮 tool call 后收口为最终答案，消息链路正确", async () => {
  const seenMessages: ChatMessage[][] = [];
  let call = 0;
  const fakeExecute: ExecuteChatCompletionFn = async (params) => {
    seenMessages.push(params.messages.map((m) => ({ ...m })));
    call += 1;
    if (call === 1) {
      assert.equal(params.toolChoice, "auto");
      assert.equal(params.skipCache, true);
      return okResponse({ toolCalls: [toolCall("c1", "echo", { q: "暗月" })] });
    }
    // 第二轮应携带 assistant tool_calls + tool 结果消息
    const transcript = params.messages;
    const assistantMsg = transcript[transcript.length - 2];
    const toolMsg = transcript[transcript.length - 1];
    assert.equal(assistantMsg.role, "assistant");
    assert.equal(assistantMsg.toolCalls?.[0]?.id, "c1");
    assert.equal(toolMsg.role, "tool");
    assert.equal(toolMsg.toolCallId, "c1");
    assert.match(toolMsg.content, /"echoed":\{"q":"暗月"\}/);
    return okResponse({ content: '{"schema_version":"x"}' });
  };

  const result = await runToolLoop({
    task: "WORLDBUILD_OFFLINE",
    messages: [{ role: "system", content: "sys" }, { role: "user", content: "u" }],
    tools: makeRegistry(),
    ctx: CTX,
    execute: fakeExecute,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.response.content, '{"schema_version":"x"}');
    assert.equal(result.trace.totalToolCalls, 1);
    assert.equal(result.trace.failedToolCalls, 0);
    assert.equal(result.trace.rounds.length, 2);
  }
  // 原始入参 messages 不被原地污染
  assert.equal(seenMessages[0].length, 2);
});

test("runToolLoop: 未知工具与参数非法折叠为错误结果，循环继续", async () => {
  let call = 0;
  const fakeExecute: ExecuteChatCompletionFn = async (params) => {
    call += 1;
    if (call === 1) {
      return okResponse({
        toolCalls: [
          { id: "c1", type: "function", function: { name: "no_such_tool", arguments: "{}" } },
          { id: "c2", type: "function", function: { name: "echo", arguments: "not-json" } },
        ],
      });
    }
    const toolMsgs = params.messages.filter((m) => m.role === "tool");
    assert.equal(toolMsgs.length, 2);
    assert.match(toolMsgs[0].content, /unknown_tool/);
    assert.match(toolMsgs[1].content, /invalid_arguments/);
    return okResponse({ content: "final" });
  };
  const result = await runToolLoop({
    task: "WORLDBUILD_OFFLINE",
    messages: [{ role: "user", content: "u" }],
    tools: makeRegistry(),
    ctx: CTX,
    execute: fakeExecute,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.trace.totalToolCalls, 2);
    assert.equal(result.trace.failedToolCalls, 2);
  }
});

test("runToolLoop: handler 抛错与超时折叠为错误结果", async () => {
  const registry = makeRegistry({
    boom: {
      definition: {
        type: "function",
        function: { name: "boom", description: "throws", parameters: { type: "object", properties: {} } },
      },
      handler: async () => {
        throw new Error("db exploded");
      },
    },
    slow: {
      definition: {
        type: "function",
        function: { name: "slow", description: "slow", parameters: { type: "object", properties: {} } },
      },
      handler: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 300)),
      timeoutMs: 20,
    },
  });
  let call = 0;
  const fakeExecute: ExecuteChatCompletionFn = async (params) => {
    call += 1;
    if (call === 1) {
      return okResponse({ toolCalls: [toolCall("c1", "boom", {}), toolCall("c2", "slow", {})] });
    }
    const toolMsgs = params.messages.filter((m) => m.role === "tool");
    assert.match(toolMsgs[0].content, /db exploded/);
    assert.match(toolMsgs[1].content, /tool_timeout/);
    return okResponse({ content: "final" });
  };
  const result = await runToolLoop({
    task: "WORLDBUILD_OFFLINE",
    messages: [{ role: "user", content: "u" }],
    tools: registry,
    ctx: CTX,
    execute: fakeExecute,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.trace.failedToolCalls, 2);
});

test("runToolLoop: 最后一轮强制 toolChoice=none；不依从上游且无正文时返回 MAX_ROUNDS_NO_FINAL", async () => {
  const choices: Array<string | undefined> = [];
  const fakeExecute: ExecuteChatCompletionFn = async (params) => {
    choices.push(params.toolChoice);
    // 始终返回 tool_calls 且无正文（不依从的上游）
    return okResponse({ toolCalls: [toolCall(`c${choices.length}`, "echo", {})] });
  };
  const result = await runToolLoop({
    task: "WORLDBUILD_OFFLINE",
    messages: [{ role: "user", content: "u" }],
    tools: makeRegistry(),
    ctx: CTX,
    maxRounds: 2,
    execute: fakeExecute,
  });
  assert.deepEqual(choices, ["auto", "none"]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "MAX_ROUNDS_NO_FINAL");
});

test("runToolLoop: 最后一轮带正文则接受为最终答案（即使附带 tool_calls）", async () => {
  let call = 0;
  const fakeExecute: ExecuteChatCompletionFn = async () => {
    call += 1;
    if (call === 1) return okResponse({ toolCalls: [toolCall("c1", "echo", {})] });
    return okResponse({ content: '{"done":true}', toolCalls: [toolCall("c2", "echo", {})] });
  };
  const result = await runToolLoop({
    task: "WORLDBUILD_OFFLINE",
    messages: [{ role: "user", content: "u" }],
    tools: makeRegistry(),
    ctx: CTX,
    maxRounds: 2,
    execute: fakeExecute,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.response.content, '{"done":true}');
});

test("runToolLoop: AI 错误直接返回 AI_ERROR 并携带 lastError", async () => {
  const fakeExecute: ExecuteChatCompletionFn = async () => ({
    ok: false,
    code: "CHAIN_EXHAUSTED",
    message: "all failed",
  });
  const result = await runToolLoop({
    task: "WORLDBUILD_OFFLINE",
    messages: [{ role: "user", content: "u" }],
    tools: makeRegistry(),
    ctx: CTX,
    execute: fakeExecute,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "AI_ERROR");
    assert.equal(result.lastError?.code, "CHAIN_EXHAUSTED");
  }
});

test("runToolLoop: 总预算耗尽返回 BUDGET_EXHAUSTED 而不是发起必败请求", async () => {
  let call = 0;
  const fakeExecute: ExecuteChatCompletionFn = async () => {
    call += 1;
    // 第一轮慢调用吃掉预算
    await new Promise((resolve) => setTimeout(resolve, 60));
    return okResponse({ toolCalls: [toolCall("c1", "echo", {})] });
  };
  const result = await runToolLoop({
    task: "WORLDBUILD_OFFLINE",
    messages: [{ role: "user", content: "u" }],
    tools: makeRegistry(),
    ctx: CTX,
    maxRounds: 5,
    totalBudgetMs: 1_500, // 等于 MIN_ROUND_BUDGET_MS 下限：第一轮后剩余预算必然不足
    execute: fakeExecute,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "BUDGET_EXHAUSTED");
  assert.equal(call, 1);
});

test("runToolLoop: 在线任务直接抛错（policy 边界）", async () => {
  await assert.rejects(
    runToolLoop({
      task: "PLAYER_CONTROL_PREFLIGHT",
      messages: [{ role: "user", content: "u" }],
      tools: makeRegistry(),
      ctx: CTX,
      execute: async () => okResponse({ content: "x" }),
    }),
    /Tool use is forbidden/
  );
});

test("runToolLoop: 单轮 tool call 超出上限被截断", async () => {
  let call = 0;
  const fakeExecute: ExecuteChatCompletionFn = async (params) => {
    call += 1;
    if (call === 1) {
      return okResponse({
        toolCalls: [toolCall("c1", "echo", {}), toolCall("c2", "echo", {}), toolCall("c3", "echo", {})],
      });
    }
    assert.equal(params.messages.filter((m) => m.role === "tool").length, 2);
    return okResponse({ content: "final" });
  };
  const result = await runToolLoop({
    task: "WORLDBUILD_OFFLINE",
    messages: [{ role: "user", content: "u" }],
    tools: makeRegistry(),
    ctx: CTX,
    maxToolCallsPerRound: 2,
    execute: fakeExecute,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.trace.totalToolCalls, 2);
});

test("runToolLoop: 超长工具结果被截断保护 token 预算", async () => {
  const registry = makeRegistry({
    big: {
      definition: {
        type: "function",
        function: { name: "big", description: "big", parameters: { type: "object", properties: {} } },
      },
      handler: async () => ({ data: "x".repeat(10_000) }),
    },
  });
  let call = 0;
  const fakeExecute: ExecuteChatCompletionFn = async (params) => {
    call += 1;
    if (call === 1) return okResponse({ toolCalls: [toolCall("c1", "big", {})] });
    const toolMsg = params.messages[params.messages.length - 1];
    assert.ok(toolMsg.content.length <= 600 + 20);
    assert.match(toolMsg.content, /truncated/);
    return okResponse({ content: "final" });
  };
  const result = await runToolLoop({
    task: "WORLDBUILD_OFFLINE",
    messages: [{ role: "user", content: "u" }],
    tools: registry,
    ctx: CTX,
    maxToolResultChars: 600,
    execute: fakeExecute,
  });
  assert.equal(result.ok, true);
});
