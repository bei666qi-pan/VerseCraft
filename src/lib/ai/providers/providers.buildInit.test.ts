// src/lib/ai/providers/providers.buildInit.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { deepseekProvider } from "@/lib/ai/providers/deepseek";
import { minimaxProvider } from "@/lib/ai/providers/minimax";
import { zhipuProvider } from "@/lib/ai/providers/zhipu";
import type { ChatMessage } from "@/lib/ai/types/core";

const messages: ChatMessage[] = [{ role: "user", content: "hi" }];

test("deepseekProvider sets Authorization and json_object when requested", () => {
  const init = deepseekProvider.buildInit("k", {
    modelApiName: "deepseek-v3.2",
    messages,
    stream: false,
    maxTokens: 100,
    temperature: 0.2,
    responseFormatJsonObject: true,
    streamIncludeUsage: false,
  });
  assert.equal(init.method, "POST");
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  assert.equal(body.model, "deepseek-v3.2");
  assert.ok(body.response_format);
  assert.equal((init.headers as Record<string, string>)["Authorization"], "Bearer k");
});

test("zhipuProvider mirrors OpenAI-compatible shape", () => {
  const init = zhipuProvider.buildInit("k", {
    modelApiName: "glm-5-air",
    messages,
    stream: true,
    maxTokens: 50,
    responseFormatJsonObject: true,
    streamIncludeUsage: true,
  });
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  assert.equal(body.stream, true);
  assert.ok(body.stream_options);
});

test("minimaxProvider uses max_completion_tokens and omits response_format", () => {
  const init = minimaxProvider.buildInit("k", {
    modelApiName: "MiniMax-M2.7-highspeed",
    messages,
    stream: false,
    maxTokens: 200,
    temperature: 0.5,
    responseFormatJsonObject: true,
    streamIncludeUsage: false,
  });
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  assert.equal(body.max_completion_tokens, 200);
  assert.equal(body.response_format, undefined);
  assert.ok(Array.isArray(body.messages));
});
