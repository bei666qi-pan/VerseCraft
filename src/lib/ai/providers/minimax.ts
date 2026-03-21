// src/lib/ai/providers/minimax.ts
import type { NormalizedCompletionRequest, ProviderRequestFactory } from "@/lib/ai/providers/types";

/** MiniMax v2 text API: OpenAI-like messages; json_mode not used — rely on prompt for JSON. */
export const minimaxProvider: ProviderRequestFactory = {
  id: "minimax",
  buildInit(apiKey: string, body: NormalizedCompletionRequest): RequestInit {
    const payload: Record<string, unknown> = {
      model: body.modelApiName,
      messages: body.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: body.stream,
      max_completion_tokens: body.maxTokens,
    };
    if (body.temperature !== undefined) {
      payload.temperature = body.temperature;
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
