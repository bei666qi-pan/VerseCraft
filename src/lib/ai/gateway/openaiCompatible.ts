import type { NormalizedCompletionRequest, ProviderRequestFactory } from "@/lib/ai/providers/types";
import type { AiProviderId, ChatMessage } from "@/lib/ai/types/core";

/**
 * OpenAI-compatible chat completions payload for one-api and similar gateways.
 */
/** Keys we never allow extraBody to set or overwrite. */
const GATEWAY_BODY_RESERVED = new Set([
  "model",
  "messages",
  "stream",
  "max_tokens",
  "temperature",
  "response_format",
  "stream_options",
  "tools",
  "tool_choice",
]);

/** Map internal ChatMessage (camelCase tool linkage) to the OpenAI wire shape (snake_case). */
function toWireMessage(m: ChatMessage): Record<string, unknown> {
  const out: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    out.tool_calls = m.toolCalls;
  }
  if (m.role === "tool" && m.toolCallId) {
    out.tool_call_id = m.toolCallId;
  }
  return out;
}

export const openaiCompatibleGateway: ProviderRequestFactory = {
  id: "oneapi" as const satisfies AiProviderId,
  buildInit(apiKey: string, body: NormalizedCompletionRequest): RequestInit {
    const payload: Record<string, unknown> = {
      model: body.modelApiName,
      messages: body.messages.map(toWireMessage),
      stream: body.stream,
      max_tokens: body.maxTokens,
    };
    if (body.temperature !== undefined) {
      payload.temperature = body.temperature;
    }
    // Schema-constrained mode takes priority over plain json_object mode when
    // both are set. Opt-in via `responseFormatJsonSchema` (see providers/types.ts).
    if (body.responseFormatJsonSchema) {
      payload.response_format = {
        type: "json_schema",
        json_schema: {
          name: body.responseFormatJsonSchema.name,
          strict: body.responseFormatJsonSchema.strict,
          schema: body.responseFormatJsonSchema.schema,
        },
      };
    } else if (body.responseFormatJsonObject) {
      payload.response_format = { type: "json_object" };
    }
    if (body.stream && body.streamIncludeUsage) {
      payload.stream_options = { include_usage: true };
    }
    if (body.tools && body.tools.length > 0) {
      payload.tools = body.tools;
      if (body.toolChoice) payload.tool_choice = body.toolChoice;
    }
    const extra = body.extraBody;
    if (extra && typeof extra === "object") {
      for (const [k, v] of Object.entries(extra)) {
        if (GATEWAY_BODY_RESERVED.has(k)) continue;
        if (Object.prototype.hasOwnProperty.call(payload, k)) continue;
        payload[k] = v;
      }
    }
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    };
  },
};
