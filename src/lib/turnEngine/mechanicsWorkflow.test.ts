import assert from "node:assert/strict";
import test from "node:test";

import type { ExecuteChatCompletionFn, ToolRegistry } from "@/lib/ai/tools/runToolLoop";
import type { AIResponse } from "@/lib/ai/types";
import { runMechanicsWorkflow } from "./mechanicsWorkflow";

const ctx = {
  requestId: "request-1",
  sessionId: "session-1",
  userId: "user-1",
  playerLocation: "B1",
  worldId: "dark-moon",
  limits: {
    maxToolRounds: 2,
    totalBudgetMs: 20_000,
    perToolTimeoutMs: 3_000,
  },
};

function response(input: Partial<AIResponse> = {}): AIResponse {
  return {
    ok: true,
    providerId: "mock",
    logicalRole: "main",
    content: "",
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latencyMs: 1,
    ...input,
  };
}

test("mechanics reuses a first response without tools and never calls a writer fallback", async () => {
  let calls = 0;
  const execute: ExecuteChatCompletionFn = async () => {
    calls += 1;
    return response({ content: "门锁已经打开。" });
  };

  const result = await runMechanicsWorkflow({
    ctx,
    messages: [{ role: "user", content: "开门" }],
    execute,
    tools: {},
  });

  assert.ok(result);
  assert.equal(calls, 1);
  assert.equal(result.narrative, "门锁已经打开。");
  assert.equal(result.toolsUsed, false);
  assert.equal(result.usage.length, 1);
});

test("mechanics executes at most one write receipt across its two model calls", async () => {
  const executed: string[] = [];
  const tools: ToolRegistry = {
    consume: {
      kind: "write",
      definition: {
        type: "function",
        function: { name: "consume", description: "consume", parameters: { type: "object", properties: {} } },
      },
      handler: async () => {
        executed.push("consume");
        return { ok: true, data: { consumedItems: ["I-A01"] } };
      },
    },
    grant: {
      kind: "write",
      definition: {
        type: "function",
        function: { name: "grant", description: "grant", parameters: { type: "object", properties: {} } },
      },
      handler: async () => {
        executed.push("grant");
        return { ok: true, data: { itemId: "I-A02" } };
      },
    },
  };
  let calls = 0;
  const execute: ExecuteChatCompletionFn = async () => {
    calls += 1;
    return calls === 1
      ? response({
          toolCalls: [
            { id: "write-1", type: "function", function: { name: "consume", arguments: "{}" } },
            { id: "write-2", type: "function", function: { name: "grant", arguments: "{}" } },
          ],
        })
      : response({ content: "你消耗了材料。" });
  };

  const result = await runMechanicsWorkflow({
    ctx,
    messages: [{ role: "user", content: "锻造" }],
    execute,
    tools,
  });

  assert.ok(result);
  assert.equal(calls, 2);
  assert.deepEqual(executed, ["consume"]);
  assert.equal(result.receipts.length, 1);
  assert.equal(result.usage.length, 2);
});
