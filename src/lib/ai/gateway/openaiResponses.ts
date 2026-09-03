// src/lib/ai/gateway/openaiResponses.ts
//
// OpenAI Responses API gateway. Mirrors openaiCompatible but emits the
// Responses request body shape. The matching response stream translator
// (`responsesToChatCompletionsTransform` in `src/lib/ai/stream/responsesLike.ts`)
// renders upstream Responses SSE events back into OpenAI Chat Completions
// streaming chunks, so the rest of the consumer pipeline (route, turn engine)
// is unchanged.
//
// Responses API surface used:
//   POST {baseUrl}/responses
//   body: { model, input: message[], max_output_tokens?, temperature?, stream, ... }
//   stream events:
//     - response.created
//     - response.in_progress
//     - response.output_item.added
//     - response.reasoning_summary_text.delta        (dropped by translator)
//     - response.reasoning_text.delta               (dropped by translator)
//     - response.output_text.delta
//     - response.function_call_arguments.delta
//     - response.function_call_arguments.done
//     - response.completed
//     - response.error / response.failed
//
// Streaming model: this gateway supports native SSE streaming end-to-end.
// The Responses API emits delta events (output_text.delta,
// function_call_arguments.delta) that `responsesLike.ts` consumes as a real
// stream and renders as Chat-Completions-shaped chunks. The non-stream
// wrapper `nonStreamResponsesToChatCompletionsStream` is reserved for the
// specific case where the active endpoint (Volcengine Ark agent-plan
// minimax-m3, in the `streaming + thinking:disabled + json_object` combo)
// emits non-DM-JSON narrative deltas under streaming — see the comment at
// the start of `buildInit` below. For every other endpoint — and for
// strict function tool mode on Ark — native streaming is the default.
// See AGENTS.md §3.2.6 for the full current picture.
import type { NormalizedCompletionRequest, ProviderRequestFactory } from "@/lib/ai/providers/types";
import {
  buildPlayerNarrativeTerminalTool,
  buildPlayerNarrativeTerminalToolChoice,
  shouldUsePlayerNarrativeTerminalTool,
} from "@/lib/ai/tools/playerNarrativeTerminalTool";
import type { AiProviderId, ChatMessage } from "@/lib/ai/types/core";

const RESPONSES_BODY_RESERVED = new Set([
  "model",
  "input",
  "stream",
  "max_output_tokens",
  "max_tokens",
  "temperature",
  "response_format",
  "stream_options",
  "tools",
  "tool_choice",
  "reasoning",
  "truncation",
  "metadata",
  "store",
  "text",
]);

function toResponsesInput(messages: readonly ChatMessage[]): unknown {
  // Responses API accepts a string or an array of message items.
  // We map the OpenAI-style chat history to Responses items.
  return messages.map((m) => {
    const role =
      m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user";
    if (typeof m.content === "string") {
      return {
        role,
        content: [
          {
            type: role === "assistant" ? "output_text" : "input_text",
            text: m.content,
          },
        ],
      };
    }
    return { role, content: m.content };
  });
}

export const openaiResponsesGateway: ProviderRequestFactory = {
  id: "openai_responses" as const satisfies AiProviderId,
  buildInit(apiKey: string, body: NormalizedCompletionRequest): RequestInit {
    // The Responses API gateway supports native SSE streaming (see file
    // header and AGENTS.md §3.2.6). The note that follows is scoped to a
    // *specific endpoint-level* incompatibility: when the active service is
    // Volcengine Ark agent-plan minimax-m3 and the caller is in the
    // `streaming + thinking:disabled + text.format.json_object` combo, the
    // upstream emits non-DM-JSON narrative deltas and only produces a
    // usable DM JSON payload in non-stream mode. The route detects that
    // combo and falls back to `nonStreamResponsesToChatCompletionsStream`,
    // which wraps the upstream non-stream JSON body as a virtual Chat
    // Completions stream. For every other endpoint — and for strict
    // function tool mode on Ark — native streaming is the default.
    const payload: Record<string, unknown> = {
      model: body.modelApiName,
      input: toResponsesInput(body.messages),
      stream: body.stream,
    };
    if (
      typeof body.maxTokens === "number" &&
      Number.isFinite(body.maxTokens) &&
      body.maxTokens > 0
    ) {
      payload.max_output_tokens = Math.trunc(body.maxTokens);
    }
    if (body.temperature !== undefined) {
      payload.temperature = body.temperature;
    }
    if (body.stream) {
      // The Responses API emits the final usage on response.completed;
      // we keep the stream alive long enough to collect it.
      payload.stream_options = { include_usage: true };
    }
    // The realtime Writer has one terminal contract: submit_narrative.
    // Explicit caller tools still pass through for non-Writer tasks.
    const extra = body.extraBody;
    // Skip the default reasoning effort when the task already disables
    // upstream thinking via extraBody (the Responses API rejects
    // `reasoning_effort` while `thinking` is set to disabled). Tasks
    // that want more reasoning can still pass it through extraBody.
    const extraHasThinkingDisabled =
      extra && typeof extra === "object" && (
        (extra as Record<string, unknown>).enable_thinking === false ||
        JSON.stringify(extra).includes('"type":"disabled"')
      );
    if (!extraHasThinkingDisabled) {
      payload.reasoning = { effort: "low" };
    }
    if (body.responseFormatJsonSchema) {
      // The Volcengine Ark Responses API (and DeepSeek's Responses API guide)
      // expect a flat `text.format` shape: `{ type: "json_schema", name,
      // schema }`. OpenAI Chat-Completions-style `json_schema` nests those
      // under `text.format.json_schema`, which Ark rejects with
      // `text.format.name can not be empty when text.format.type is
      // json_schema`. We flatten here so the upstream provider accepts the
      // request and the provider-level constraint decoder is actually engaged.
      payload.text = {
        format: {
          type: "json_schema",
          name: body.responseFormatJsonSchema.name,
          strict: body.responseFormatJsonSchema.strict,
          schema: body.responseFormatJsonSchema.schema,
        },
      };
    } else if (body.responseFormatJsonObject) {
      // Responses API does not support `response_format` (Chat Completions
      // parameter) and the equivalent `text.format: {type: "json_object"}`
      // is documented as not honoured by every Responses provider (notably
      // minimax-m3 on the Volcengine Ark plan endpoint ignores the
      // constraint under long structured prompts and emits narrative prose
      // instead). Without a json_schema we cannot reliably force a parseable
      // DM JSON, so fall back to a minimal schema that pins the required
      // top-level fields instead of an unenforceable json_object request.
      payload.text = {
        format: {
          type: "json_schema",
          name: "verse_craft_minimal_dm",
          strict: false,
          schema: {
            type: "object",
            additionalProperties: true,
            required: [
              "is_action_legal",
              "sanity_damage",
              "narrative",
              "is_death",
            ],
            properties: {
              is_action_legal: { type: "boolean" },
              sanity_damage: { type: "number" },
              narrative: { type: "string" },
              is_death: { type: "boolean" },
            },
          },
        },
      };
    }
    // Translate Chat-Completions-style function tools to the Responses API
    // shape. The provider-level tool-choice + strict-schema decoder is the
    // only reliable way to force minimax-m3 (Volcengine Ark
    // agent-plan) to emit a structured DM JSON for the player-chat prompt.
    //
    // Strict function mode and `text.format.json_schema` are mutually
    // exclusive in the same request (AGENTS.md §3.2.2). When we append
    // `submit_narrative` automatically we must therefore drop the
    // `text` block — otherwise upstream providers (notably Volcengine
    // Ark agent-plan) reject the request with conflicting
    // constraint-decoder instructions. See change
    // `open-responses-streaming-for-player-turn` and AGENTS.md §3.2.6.
    //
    // Writer has one narrow candidate protocol: submit_narrative. There is no
    // parallel full-DM terminal envelope.
    const useNarrative = shouldUsePlayerNarrativeTerminalTool(body);
    if (useNarrative) {
      const tool = buildPlayerNarrativeTerminalTool();
      const toolChoice = buildPlayerNarrativeTerminalToolChoice();
      payload.tools = [
        {
          type: tool.type,
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      ];
      payload.tool_choice = {
        type: "function",
        name: toolChoice.function.name,
      };
      // Provider-level 强约束（A only — see AGENTS.md §3.2.5/§3.2.6）：
      // 禁止 LLM 在 tool_call 之外另输出 prose。Ark agent-plan minimax-m3
      // 支持此字段。fallback 投影降级不在这里做（冗余）。
      payload.parallel_tool_calls = false;
      delete payload.text;
    } else if (body.tools && body.tools.length > 0) {
      payload.tools = body.tools.map((t) => ({
        type: t.type,
        name: t.function.name,
        description: t.function.description,
        ...(t.function.strict !== undefined ? { strict: t.function.strict } : {}),
        parameters: t.function.parameters,
      }));
      if (body.toolChoice) {
        if (typeof body.toolChoice === "string") {
          payload.tool_choice = body.toolChoice;
        } else {
          // Always emit the strict `{"type":"function","name":...}` form so
          // upstream providers (notably Volcengine Ark agent-plan
          // minimax-m3) must invoke the exact function instead of
          // emitting a free-form response or a sibling function.
          payload.tool_choice = {
            type: "function",
            name: body.toolChoice.function.name,
          };
        }
      }
      // Caller-supplied tools win and coexist with strict function-style
      // tool_choice. Strict function tool and text.format.json_schema are
      // mutually exclusive in the same request (AGENTS.md §3.2.2), so the
      // text block must be dropped here too — otherwise upstream providers
      // reject the request with conflicting constraint-decoder instructions.
      delete payload.text;
    }
    if (extra && typeof extra === "object") {
      for (const [k, v] of Object.entries(extra)) {
        if (RESPONSES_BODY_RESERVED.has(k)) continue;
        if (Object.prototype.hasOwnProperty.call(payload, k)) continue;
        payload[k] = v;
      }
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    return {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    };
  },
};
