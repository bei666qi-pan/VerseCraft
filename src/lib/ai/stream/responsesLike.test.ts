// src/lib/ai/stream/responsesLike.test.ts
//
// Contract tests for the real native Responses API -> Chat Completions SSE
// translator at `src/lib/ai/stream/responsesLike.ts`.
//
// These tests pin the wire-format contract that `/api/chat` and the rest
// of the VerseCraft consumer pipeline (parseOpenAiLikeStreamData +
// player-turn-terminal-tool handling) depend on. They cover:
//   - response.output_text.delta                  -> delta.content frame
//   - response.completed / response.incomplete    -> usage chunk + [DONE]
//   - response.error / response.failed            -> empty stop chunk + [DONE]
//   - response.output_item.added (function_call)  -> tool_calls header frame
//   - response.function_call_arguments.delta      -> args delta frame (concatenated)
//   - response.function_call_arguments.done       -> finish_reason:"tool_calls" frame
//
// See AGENTS.md §3.2.6 and the change `open-responses-streaming-for-player-turn`.

import test from "node:test";
import assert from "node:assert/strict";
import {
  extractResponsesNonStreamContent,
  nonStreamResponsesToChatCompletionsStream,
  responsesToChatCompletionsTransform,
} from "@/lib/ai/stream/responsesLike";

const decoder = new TextDecoder("utf-8");

function sse(events: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join("");
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function chunkObjects(sseOutput: string): Array<Record<string, unknown>> {
  return sseOutput
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith("data:") && frame !== "data: [DONE]")
    .map((frame) => JSON.parse(frame.slice(5).trim()) as Record<string, unknown>);
}

const OPTS = { model: "test-model", streamId: "stream-1", createdAt: 1_700_000_000 };

// --------------------------------------------------------------------------
// 2.1 / 2.2 / 2.3 — real native streaming for text, error, and function_call
// --------------------------------------------------------------------------

test("response.output_text.delta produces a delta.content frame, then response.completed terminates with usage + [DONE]", async () => {
  const upstream = sse([
    { type: "response.output_text.delta", delta: "你好" },
    { type: "response.output_text.delta", delta: "世界" },
    {
      type: "response.completed",
      response: {
        usage: {
          total_tokens: 12,
          input_tokens: 7,
          output_tokens: 5,
          input_tokens_details: { cached_tokens: 1 },
        },
      },
    },
  ]);

  const out = await readAll(responsesToChatCompletionsTransform(upstream, OPTS));
  assert.match(out, /\[DONE\]/);

  const chunks = chunkObjects(out);
  assert.equal(chunks.length, 3);

  // Two text deltas, concatenated
  assert.equal(chunks[0]?.choices?.[0]?.delta?.content, "你好");
  assert.equal(chunks[1]?.choices?.[0]?.delta?.content, "世界");

  // Final usage chunk with finish_reason:"stop". TokenUsage is rendered in
  // camelCase by `usageFromResponsesResponse` (see responsesLike.ts:59-67).
  const last = chunks[2];
  assert.equal(last?.choices?.[0]?.finish_reason, "stop");
  const usage = last?.usage as Record<string, unknown> | undefined;
  assert.equal(usage?.totalTokens, 12);
  assert.equal(usage?.promptTokens, 7);
  assert.equal(usage?.completionTokens, 5);
  assert.equal(usage?.cachedPromptTokens, 1);
});

test("response.error and response.failed each emit a stop chunk + [DONE]", async () => {
  for (const eventType of ["response.error", "response.failed"]) {
    const upstream = sse([{ type: eventType, message: "upstream blow up" }]);
    const out = await readAll(responsesToChatCompletionsTransform(upstream, OPTS));
    assert.match(out, /\[DONE\]/);
    const chunks = chunkObjects(out);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.choices?.[0]?.finish_reason, "stop");
    assert.deepEqual(chunks[0]?.choices?.[0]?.delta, {});
  }
});

test("function_call streaming: header -> args deltas concatenated -> finish chunk + stop", async () => {
  const upstream = sse([
    {
      type: "response.output_item.added",
      item: { type: "function_call", id: "call_abc", name: "submit_narrative" },
    },
    { type: "response.function_call_arguments.delta", delta: '{"narrative":"你' },
    { type: "response.function_call_arguments.delta", delta: '好","options":["a","b","c","d"]}' },
    { type: "response.function_call_arguments.done" },
  ]);

  const out = await readAll(responsesToChatCompletionsTransform(upstream, OPTS));
  // When the upstream closes without an explicit `response.completed` /
  // `response.incomplete` event, the translator synthesises a final stop
  // chunk + [DONE] (sawTerminal stays false until one of those events fires).
  assert.match(out, /\[DONE\]/);

  const chunks = chunkObjects(out);
  // header + 2 args deltas + finish_reason:"tool_calls" + synthesised stop
  assert.equal(chunks.length, 5);

  // header chunk: id + name + empty args
  const header = chunks[0];
  const headerCall = header?.choices?.[0]?.delta?.tool_calls?.[0];
  assert.equal(headerCall?.id, "call_abc");
  assert.equal(headerCall?.type, "function");
  assert.equal(headerCall?.function?.name, "submit_narrative");
  assert.equal(headerCall?.function?.arguments, "");

  // args deltas are emitted verbatim — concatenation happens in the consumer
  assert.equal(chunks[1]?.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments, '{"narrative":"你');
  assert.equal(chunks[2]?.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments, '好","options":["a","b","c","d"]}');

  // finish chunk: finish_reason:"tool_calls"
  const finish = chunks[3];
  assert.equal(finish?.choices?.[0]?.finish_reason, "tool_calls");
  assert.deepEqual(finish?.choices?.[0]?.delta, {});

  // synthesised stop chunk when upstream closes without response.completed
  const tail = chunks[4];
  assert.equal(tail?.choices?.[0]?.finish_reason, "stop");
  assert.deepEqual(tail?.choices?.[0]?.delta, {});

  // Sanity: the two args deltas concatenate to a valid JSON DM-JSON-shaped payload
  const concatenated =
    chunks[1]?.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments +
    chunks[2]?.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments;
  const parsed = JSON.parse(String(concatenated)) as Record<string, unknown>;
  assert.equal(parsed.narrative, "你好");
  assert.deepEqual(parsed.options, ["a", "b", "c", "d"]);
});

test("reasoning events are silently dropped; only the visible text delta + synthesised stop chunk remain", async () => {
  const upstream = sse([
    { type: "response.reasoning_summary_text.delta", delta: "thinking... " },
    { type: "response.reasoning_text.delta", delta: "more thinking" },
    { type: "response.output_text.delta", delta: "visible text" },
  ]);
  const out = await readAll(responsesToChatCompletionsTransform(upstream, OPTS));
  const chunks = chunkObjects(out);
  // reasoning events produce no Chat-Completions chunks; the visible text
  // delta emits one chunk, and the upstream close synthesises a stop chunk.
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]?.choices?.[0]?.delta?.content, "visible text");
  assert.equal(chunks[1]?.choices?.[0]?.finish_reason, "stop");
  assert.ok(!out.includes("thinking"), "reasoning payload must not leak through");
});

// --------------------------------------------------------------------------
// 2.4 fallback wrapper — nonStreamResponsesToChatCompletionsStream
// --------------------------------------------------------------------------

test("nonStreamResponsesToChatCompletionsStream wraps a non-stream function_call response as a tool-call sequence + usage + [DONE]", async () => {
  const data = {
    usage: { total_tokens: 9, input_tokens: 4, output_tokens: 5 },
    output: [
      {
        type: "function_call",
        call_id: "call_xyz",
        name: "submit_narrative",
        arguments: '{"narrative":"hi","options":["1","2","3","4"]}',
      },
    ],
  };

  const out = await readAll(nonStreamResponsesToChatCompletionsStream(data, OPTS));
  assert.match(out, /\[DONE\]/);
  const chunks = chunkObjects(out);

  // header + args + finish + usage(stop) = 4
  assert.equal(chunks.length, 4);
  const header = chunks[0];
  assert.equal(header?.choices?.[0]?.delta?.tool_calls?.[0]?.id, "call_xyz");
  assert.equal(header?.choices?.[0]?.delta?.tool_calls?.[0]?.function?.name, "submit_narrative");
  assert.equal(chunks[1]?.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments, '{"narrative":"hi","options":["1","2","3","4"]}');
  assert.equal(chunks[2]?.choices?.[0]?.finish_reason, "tool_calls");
  assert.equal(chunks[3]?.choices?.[0]?.finish_reason, "stop");
  // TokenUsage is rendered in camelCase.
  assert.equal((chunks[3]?.usage as Record<string, unknown> | undefined)?.totalTokens, 9);
});

test("nonStreamResponsesToChatCompletionsStream wraps a non-stream text response as one content delta + stop", async () => {
  const data = {
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "world says hi" }],
      },
    ],
  };
  const out = await readAll(nonStreamResponsesToChatCompletionsStream(data, OPTS));
  const chunks = chunkObjects(out);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]?.choices?.[0]?.delta?.content, "world says hi");
  assert.equal(chunks[1]?.choices?.[0]?.finish_reason, "stop");
});

test("extractResponsesNonStreamContent surfaces text + tool calls + usage", () => {
  const data = {
    usage: { total_tokens: 3, input_tokens: 1, output_tokens: 2 },
    output: [
      {
        type: "function_call",
        call_id: "c1",
        name: "submit_narrative",
        arguments: '{"narrative":"x","options":["a","b","c","d"]}',
      },
    ],
  };
  const extracted = extractResponsesNonStreamContent(data);
  assert.equal(extracted.toolCalls.length, 1);
  assert.equal(extracted.toolCalls[0]?.function.name, "submit_narrative");
  assert.equal(extracted.toolCalls[0]?.function.arguments, '{"narrative":"x","options":["a","b","c","d"]}');
  assert.equal(extracted.usage?.totalTokens, 3);
  // tool_calls path also surfaces the raw JSON as `content` so the downstream
  // DM JSON parser can pick it up verbatim (this is the bridge the
  // non-stream wrapper relies on).
  assert.match(extracted.content, /"narrative":"x"/);
});
