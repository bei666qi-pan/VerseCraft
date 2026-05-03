// src/lib/ai/stream/openaiLike.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  extractNonStreamContent,
  normalizeFinishReason,
  normalizeUsage,
  parseOpenAiLikeStreamData,
} from "@/lib/ai/stream/openaiLike";

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
  assert.equal(frame?.finishReason, null);
});

test("parseOpenAiLikeStreamData returns null for invalid JSON", () => {
  assert.equal(parseOpenAiLikeStreamData("not-json"), null);
});

test("parseOpenAiLikeStreamData captures finish_reason without changing delta", () => {
  const line = JSON.stringify({
    choices: [{ delta: {}, finish_reason: "length" }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 896,
      total_tokens: 996,
      prompt_tokens_details: { cached_tokens: 80 },
    },
  });
  const frame = parseOpenAiLikeStreamData(line);
  assert.equal(frame?.deltaText, "");
  assert.equal(frame?.finishReason, "length");
  assert.equal(frame?.usage?.cachedPromptTokens, 80);
  assert.equal(frame?.isDoneToken, true);
});

test("normalizeFinishReason reads the first stable choice reason", () => {
  assert.equal(
    normalizeFinishReason({
      choices: [{ finish_reason: null }, { finish_reason: "content_filter" }],
    }),
    "content_filter",
  );
  assert.equal(normalizeFinishReason({ choices: [] }), null);
});

test("extractNonStreamContent reads message.content", () => {
  const { content, usage } = extractNonStreamContent({
    choices: [{ message: { content: '{"ok":true}' } }],
    usage: { total_tokens: 1 },
  });
  assert.equal(content, '{"ok":true}');
  assert.equal(usage?.totalTokens, 1);
});

test("normalizeUsage reads prompt_tokens_details.cached_tokens", () => {
  const u = normalizeUsage({
    prompt_tokens: 1000,
    completion_tokens: 50,
    total_tokens: 1050,
    prompt_tokens_details: { cached_tokens: 800 },
  });
  assert.equal(u?.cachedPromptTokens, 800);
  assert.equal(u?.totalTokens, 1050);
});

test("normalizeUsage reads cached_prompt_tokens alias", () => {
  const u = normalizeUsage({
    prompt_tokens: 10,
    completion_tokens: 2,
    total_tokens: 12,
    cached_prompt_tokens: 7,
  });
  assert.equal(u?.cachedPromptTokens, 7);
});
