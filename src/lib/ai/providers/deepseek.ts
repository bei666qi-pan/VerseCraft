// src/lib/ai/providers/deepseek.ts
import type { NormalizedCompletionRequest, ProviderRequestFactory } from "@/lib/ai/providers/types";

export const deepseekProvider: ProviderRequestFactory = {
  id: "deepseek",
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
