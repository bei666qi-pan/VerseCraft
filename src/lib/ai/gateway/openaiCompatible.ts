import type { NormalizedCompletionRequest, ProviderRequestFactory } from "@/lib/ai/providers/types";
import {
  buildPlayerTurnTerminalTool,
  buildPlayerTurnTerminalToolChoice,
  resolvePlayerChatFunctionCallingMode,
} from "@/lib/ai/tools/playerTurnTerminalTool";
import type { AiProviderId, ChatMessage } from "@/lib/ai/types/core";

/**
 * OpenAI-compatible chat completions payload.
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
  id: "openai_compatible" as const satisfies AiProviderId,
  buildInit(apiKey: string, body: NormalizedCompletionRequest): RequestInit {
    const payload: Record<string, unknown> = {
      model: body.modelApiName,
      messages: body.messages.map(toWireMessage),
      stream: body.stream,
    };
    // Deliberately omit max_tokens. The codex-ds DeepSeek models must be
    // allowed to finish their reasoning and complete JSON naturally. Keep
    // max_tokens reserved so extraBody cannot silently introduce a cap.
    if (body.temperature !== undefined) {
      payload.temperature = body.temperature;
    }

    // PLAYER_CHAT is the only realtime streaming task. In function-calling mode,
    // the model must submit one terminal `submit_player_turn` call. Its arguments
    // are rewritten back into the existing DM JSON stream by fetchWithRetry, so
    // the route keeps one model call and all downstream contracts stay unchanged.
    const terminalToolMode = resolvePlayerChatFunctionCallingMode();
    const usePlayerTurnTerminalTool =
      body.stream && terminalToolMode !== "off" && (!body.tools || body.tools.length === 0);

    // Preserve the existing response-format contract even when the terminal tool
    // is enabled. The function parameter schema governs tool arguments; the
    // response_format remains a compatibility signal for established gateways,
    // tests, metrics, and immediate prefer-mode rollback.
    if (body.responseFormatJsonSchema && !usePlayerTurnTerminalTool) {
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
    if (usePlayerTurnTerminalTool) {
      payload.tools = [buildPlayerTurnTerminalTool()];
      payload.tool_choice = buildPlayerTurnTerminalToolChoice();
    } else if (body.tools && body.tools.length > 0) {
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
