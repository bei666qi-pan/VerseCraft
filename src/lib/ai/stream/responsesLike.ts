// src/lib/ai/stream/responsesLike.ts
//
// Translates an upstream OpenAI Responses API SSE stream into OpenAI Chat
// Completions streaming chunks, so the rest of the VerseCraft consumer
// pipeline (parseOpenAiLikeStreamData + the existing chat route) sees the
// same wire format as before.
//
// We only translate events that carry user-visible content:
//   - response.output_text.delta            -> {choices:[{delta:{content:...}}]}
//   - response.output_text.done             -> ignored (delta already delivered)
//   - response.content_part.done            -> ignored
//   - response.completed                    -> emits a final chunk with usage
//                                                + finish_reason:"stop", then [DONE]
//   - response.error / response.failed       -> emits an empty chunk with
//                                                finish_reason:"stop" so the
//                                                caller closes the read loop
// Reasoning events (response.reasoning_summary_text.delta, response.reasoning_text.delta)
// are intentionally dropped — Chat Completions has no equivalent and the
// DM JSON parser must not see them.
import type { TokenUsage } from "@/lib/ai/types/core";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

function tryReadNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function usageFromResponsesResponse(response: unknown): TokenUsage | null {
  if (!response || typeof response !== "object") return null;
  const root = response as Record<string, unknown>;
  const usage = (root.usage ?? null) as Record<string, unknown> | null;
  if (!usage) return null;
  const total = tryReadNumber(usage.total_tokens);
  const input = tryReadNumber(usage.input_tokens);
  const output = tryReadNumber(usage.output_tokens);
  const details = (usage.input_tokens_details ?? null) as Record<string, unknown> | null;
  const cached = details ? tryReadNumber(details.cached_tokens) : undefined;
  const out: TokenUsage = {
    totalTokens: total && total > 0 ? Math.trunc(total) : undefined,
    promptTokens: input && input > 0 ? Math.trunc(input) : undefined,
    completionTokens: output && output > 0 ? Math.trunc(output) : undefined,
  };
  if (cached && cached > 0) out.cachedPromptTokens = Math.trunc(cached);
  if (!out.totalTokens && !out.promptTokens && !out.completionTokens && !out.cachedPromptTokens) {
    return null;
  }
  return out;
}

interface ResponsesEvent {
  type?: string;
  delta?: string;
  response?: unknown;
  item?: { type?: string; id?: string; name?: string };
  text?: string;
}

function isJsonObject(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function buildContentChunk(delta: string, model: string, created: number, id: string): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: { content: delta },
        finish_reason: null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function buildToolCallHeaderChunk(
  callId: string,
  name: string,
  model: string,
  created: number,
  id: string,
): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            { index: 0, id: callId, type: "function", function: { name, arguments: "" } },
          ],
        },
        finish_reason: null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function buildToolCallArgsChunk(argsDelta: string, model: string, created: number, id: string): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [{ index: 0, function: { arguments: argsDelta } }],
        },
        finish_reason: null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function buildToolCallFinishChunk(model: string, created: number, id: string): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function buildUsageChunk(
  usage: TokenUsage | null,
  model: string,
  created: number,
  id: string,
): string {
  const payload: Record<string, unknown> = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop",
      },
    ],
  };
  if (usage) payload.usage = usage;
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function buildEmptyStopChunk(model: string, created: number, id: string): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  })}\n\n`;
}

function buildErrorChunk(model: string, created: number, id: string): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  })}\n\n`;
}

export interface ResponsesToChatCompletionsOptions {
  /** Fallback model label for the synthesized chat.completion.chunk frames. */
  model: string;
  /** Stable stream id; usually the upstream response id. */
  streamId?: string;
  /** Created-at epoch seconds for synthesized chunks. */
  createdAt?: number;
}

/**
 * Wraps an upstream Responses API SSE stream so the rest of the pipeline
 * sees an OpenAI Chat Completions streaming stream.
 *
 * The transform buffers complete SSE events (lines starting with `data: `)
 * because the Responses API also emits `event:` lines that we do not need
 * to forward. We never translate `data: [DONE]` since the Responses API
 * does not emit it; we synthesize `[DONE]` ourselves after the upstream
 * `response.completed` or `response.failed` event so the caller's reader
 * loop terminates cleanly.
 */
export function responsesToChatCompletionsTransform(
  upstream: ReadableStream<Uint8Array>,
  opts: ResponsesToChatCompletionsOptions,
): ReadableStream<Uint8Array> {
  const model = opts.model;
  const createdAt = opts.createdAt ?? Math.floor(Date.now() / 1000);
  const streamId = opts.streamId ?? "responses-stream";
  const reader = upstream.getReader();
  let buffer = "";
  let sawTerminal = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            if (!sawTerminal) {
              controller.enqueue(encoder.encode(buildEmptyStopChunk(model, createdAt, streamId)));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              sawTerminal = true;
            }
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          let nlIdx = buffer.indexOf("\n");
          while (nlIdx >= 0) {
            const raw = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 1);
            const line = raw.replace(/\r$/, "");
            if (line.startsWith("data:")) {
              const payload = line.slice(5).trim();
              if (payload && payload !== "[DONE]" && isJsonObject(payload)) {
                let parsed: ResponsesEvent | null = null;
                try {
                  parsed = JSON.parse(payload) as ResponsesEvent;
                } catch {
                  parsed = null;
                }
                if (parsed) {
                  const type = parsed.type ?? "";
                  if (type === "response.output_text.delta") {
                    const delta =
                      typeof parsed.delta === "string"
                        ? parsed.delta
                        : typeof parsed.text === "string"
                          ? parsed.text
                          : "";
                    if (delta) {
                      controller.enqueue(
                        encoder.encode(buildContentChunk(delta, model, createdAt, streamId)),
                      );
                    }
                  } else if (type === "response.output_item.added") {
                    // The Responses API announces a function_call item before
                    // its arguments start streaming. Emit a Chat-Completions
                    // tool-call header chunk so downstream consumers (which
                    // expect `delta.tool_calls[0].id/name`) get a stable
                    // place to start accumulating arguments.
                    const item = parsed.item as
                      | { type?: string; id?: string; name?: string }
                      | undefined;
                    if (item && item.type === "function_call" && item.id && item.name) {
                      controller.enqueue(
                        encoder.encode(
                          buildToolCallHeaderChunk(
                            item.id,
                            item.name,
                            model,
                            createdAt,
                            streamId,
                          ),
                        ),
                      );
                    }
                  } else if (type === "response.function_call_arguments.delta") {
                    const delta =
                      typeof parsed.delta === "string" ? parsed.delta : "";
                    if (delta) {
                      controller.enqueue(
                        encoder.encode(
                          buildToolCallArgsChunk(delta, model, createdAt, streamId),
                        ),
                      );
                    }
                  } else if (type === "response.function_call_arguments.done") {
                    // Mark the choice as tool-call-terminated so the consumer
                    // stops reading delta.content and switches to tool_calls.
                    controller.enqueue(
                      encoder.encode(buildToolCallFinishChunk(model, createdAt, streamId)),
                    );
                  } else if (type === "response.completed" || type === "response.incomplete") {
                    const usage = usageFromResponsesResponse(parsed.response);
                    controller.enqueue(
                      encoder.encode(buildUsageChunk(usage, model, createdAt, streamId)),
                    );
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    sawTerminal = true;
                  } else if (type === "response.failed" || type === "error") {
                    controller.enqueue(
                      encoder.encode(buildErrorChunk(model, createdAt, streamId)),
                    );
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    sawTerminal = true;
                  }
                }
              }
            }
            nlIdx = buffer.indexOf("\n");
          }
        }
      } catch (err) {
        if (!sawTerminal) {
          try {
            controller.enqueue(encoder.encode(buildErrorChunk(model, createdAt, streamId)));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            sawTerminal = true;
          } catch {
            /* controller already closed */
          }
        }
        controller.error(err);
      }
    },
    cancel() {
      try {
        void reader.cancel();
      } catch {
        /* noop */
      }
    },
  });
}

/**
 * Best-effort content/usage extraction for the non-stream Responses API
 * response payload. The Responses API returns a structured `output` array
 * with reasoning + message items; we keep the first assistant message's
 * concatenated text content.
 *
 * When the request forced a function tool via `tool_choice` (the player-chat
 * path uses `submit_player_dm`), the model emits a `function_call` item
 * whose `arguments` field is a structured JSON string. We surface those
 * arguments as the chat-route's `content` so the downstream DM JSON parser
 * can pick up the structured payload verbatim, and we expose the matching
 * `tool_calls` so any caller that branches on tool presence keeps working.
 */
export function extractResponsesNonStreamContent(data: unknown): {
  content: string;
  usage: TokenUsage | null;
  toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
} {
  if (!data || typeof data !== "object")
    return { content: "", usage: null, toolCalls: [] };
  const root = data as Record<string, unknown>;
  const usage = usageFromResponsesResponse(root);
  const output = Array.isArray(root.output) ? root.output : [];
  const pieces: string[] = [];
  const toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (obj.type === "function_call") {
      const callId = typeof obj.call_id === "string" ? obj.call_id : "";
      const name = typeof obj.name === "string" ? obj.name : "";
      const args = typeof obj.arguments === "string" ? obj.arguments : "{}";
      if (callId && name) {
        toolCalls.push({ id: callId, type: "function", function: { name, arguments: args } });
        if (pieces.length === 0 && args) pieces.push(args);
      }
      continue;
    }
    if (obj.type !== "message") continue;
    if (obj.role && obj.role !== "assistant") continue;
    const content = Array.isArray(obj.content) ? obj.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (p.type === "output_text" && typeof p.text === "string") {
        pieces.push(p.text);
      }
    }
  }
  return { content: pieces.join(""), usage, toolCalls };
}

/**
 * Wraps a single, already-fetched non-stream Responses API response as a
 * virtual Chat Completions streaming stream. The consumer sees one or more
 * `data: {...content delta...}` chunks followed by a usage chunk and
 * `data: [DONE]`, which is exactly what the OpenAI Chat Completions streaming
 * pipeline expects.
 *
 * The current Volcengine Ark agent-plan endpoint emits non-DM-JSON delta
 * chunks when `streaming + thinking:disabled + json_object format` are all
 * active simultaneously (deepseek-v4-flash returns narrative prose instead of
 * structured JSON). Forcing non-stream and then synthesising a virtual stream
 * keeps the rest of the chat route, options_regen, narrative rendering,
 * validator and commit pipeline unchanged while guaranteeing we always see
 * a single parseable DM JSON payload.
 */
export function nonStreamResponsesToChatCompletionsStream(
  data: unknown,
  opts: ResponsesToChatCompletionsOptions,
): ReadableStream<Uint8Array> {
  const model = opts.model;
  const createdAt = opts.createdAt ?? Math.floor(Date.now() / 1000);
  const streamId = opts.streamId ?? "responses-nostream";
  const { content, usage, toolCalls } = extractResponsesNonStreamContent(data);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (toolCalls.length > 0) {
        // Reproduce the Chat-Completions tool-call streaming sequence:
        // header chunk (id + name + empty arguments) → arguments chunk →
        // finish chunk (`finish_reason: "tool_calls"`).
        for (const tc of toolCalls) {
          controller.enqueue(
            encoder.encode(
              buildToolCallHeaderChunk(tc.id, tc.function.name, model, createdAt, streamId),
            ),
          );
          controller.enqueue(
            encoder.encode(
              buildToolCallArgsChunk(tc.function.arguments, model, createdAt, streamId),
            ),
          );
          controller.enqueue(
            encoder.encode(buildToolCallFinishChunk(model, createdAt, streamId)),
          );
        }
      } else if (content.length > 0) {
        controller.enqueue(encoder.encode(buildContentChunk(content, model, createdAt, streamId)));
      }
      controller.enqueue(encoder.encode(buildUsageChunk(usage, model, createdAt, streamId)));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
