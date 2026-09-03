import test from "node:test";
import assert from "node:assert/strict";
import { executeChatCompletion, executePlayerChatStream } from "@/lib/ai/router/execute";
import { VERSECRAFT_FINAL_PREFIX } from "@/lib/turnEngine/sse";

async function withMockEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prevProvider = process.env.AI_PROVIDER;
  const prevScenario = process.env.VC_MOCK_AI_SCENARIO;
  process.env.AI_PROVIDER = "mock";
  delete process.env.VC_MOCK_AI_SCENARIO;
  try {
    return await fn();
  } finally {
    if (prevProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = prevProvider;
    if (prevScenario === undefined) delete process.env.VC_MOCK_AI_SCENARIO;
    else process.env.VC_MOCK_AI_SCENARIO = prevScenario;
  }
}

test("mock provider streams VerseCraft-shaped player DM JSON", async () => {
  await withMockEnv(async () => {
    const res = await executePlayerChatStream({
      messages: [{ role: "user", content: "我贴着墙根听走廊尽头的动静。" }],
      ctx: { requestId: "mock_stream_test", task: "PLAYER_CHAT" },
    });
    assert.equal(res.ok, true);
    assert.equal(res.ok && res.providerId, "mock");
    const body = await (res.ok ? res.response.text() : Promise.resolve(""));
    assert.ok(body.includes("旧公寓三楼走廊"));
    assert.ok(body.includes("我贴着墙根"));
    assert.ok(!body.includes("你贴着墙根"));
    assert.ok(!body.includes("廖暗"));
    assert.ok(!body.includes(VERSECRAFT_FINAL_PREFIX));
    assert.ok(body.includes("[DONE]"));
  });
});

test("mock provider supports valid and invalid options-only completions", async () => {
  await withMockEnv(async () => {
    const valid = await executeChatCompletion({
      task: "INTENT_PARSE",
      messages: [{ role: "user", content: "整理四个下一步行动。" }],
      ctx: { requestId: "mock_options_valid", task: "INTENT_PARSE" },
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.ok && valid.providerId, "mock");
    const validOptions = JSON.parse(valid.ok ? valid.content : "{}").options as string[];
    assert.equal(validOptions.length, 4);
    assert.ok(validOptions.every((option) => option.startsWith("我")));
    assert.ok(validOptions.every((option) => !option.includes("廖暗")));
    assert.ok(validOptions.every((option) => Array.from(option.replace(/[，。！？、\s]/g, "")).length <= 20));

    process.env.VC_MOCK_AI_SCENARIO = "options_only_invalid";
    const invalid = await executeChatCompletion({
      task: "INTENT_PARSE",
      messages: [{ role: "user", content: "整理四个下一步行动。" }],
      ctx: { requestId: "mock_options_invalid", task: "INTENT_PARSE" },
    });
    assert.equal(invalid.ok, true);
    const options = JSON.parse(invalid.ok ? invalid.content : "{}").options as string[];
    assert.ok(options.includes("查看背包"));
  });
});
