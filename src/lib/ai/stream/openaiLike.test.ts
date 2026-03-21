// src/lib/ai/stream/openaiLike.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { extractNonStreamContent, parseOpenAiLikeStreamData } from "@/lib/ai/stream/openaiLike";

test("parseOpenAiLikeStreamData handles [DONE] and empty", () => {
  const done = parseOpenAiLikeStreamData("[DONE]");
  assert.equal(done?.isDoneToken, true);
  assert.equal(done?.deltaText, "");
  const empty = parseOpenAiLikeStreamData("   ");
  assert.ok(empty);
  assert.equal(empty.deltaText, "");
});

test("parseOpenAiLikeStreamData extracts delta content and usage", () => {
  const line = JSON.stringify({
    choices: [{ delta: { content: "你好" }, finish_reason: "" }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  });
  const frame = parseOpenAiLikeStreamData(line);
  assert.equal(frame?.deltaText, "你好");
  assert.equal(frame?.usage?.totalTokens, 5);
  assert.equal(frame?.usage?.promptTokens, 3);
});

test("parseOpenAiLikeStreamData returns null for invalid JSON", () => {
  assert.equal(parseOpenAiLikeStreamData("not-json"), null);
});

test("extractNonStreamContent reads message.content", () => {
  const { content, usage } = extractNonStreamContent({
    choices: [{ message: { content: '{"ok":true}' } }],
    usage: { total_tokens: 1 },
  });
  assert.equal(content, '{"ok":true}');
  assert.equal(usage?.totalTokens, 1);
});
