import type { NormalizedCompletionRequest, ProviderRequestFactory } from "@/lib/ai/providers/types";
import type { AiProviderId } from "@/lib/ai/types/core";

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
]);

export const openaiCompatibleGateway: ProviderRequestFactory = {
  id: "oneapi" as const satisfies AiProviderId,
  buildInit(apiKey: string, body: NormalizedCompletionRequest): RequestInit {
    const payload: Record<string, unknown> = {
      model: body.modelApiName,
      messages: body.messages,
      stream: body.stream,
      max_tokens: body.maxTokens,
    };
    if (body.temperature !== undefined) {
      payload.temperature = body.temperature;
    }
    if (body.responseFormatJsonObject) {
      payload.response_format = { type: "json_object" };
    }
    if (body.stream && body.streamIncludeUsage) {
      payload.stream_options = { include_usage: true };
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
