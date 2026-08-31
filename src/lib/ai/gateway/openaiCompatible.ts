import type { NormalizedCompletionRequest, ProviderRequestFactory } from "@/lib/ai/providers/types";
import {
  buildPlayerTurnTerminalTool,
  buildPlayerTurnTerminalToolChoice,
  shouldUsePlayerTurnTerminalTool,
} from "@/lib/ai/tools/playerTurnTerminalTool";
import {
  buildPlayerNarrativeTerminalTool,
  buildPlayerNarrativeTerminalToolChoice,
  shouldUsePlayerNarrativeTerminalTool,
} from "@/lib/ai/tools/playerNarrativeTerminalTool";
import { envBoolean } from "@/lib/config/envRaw";
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
    // The decision is shared with `openaiResponsesGateway` via
    // `shouldUsePlayerTurnTerminalTool` so both transports gate strict-function
    // mode on the same condition (see change
    // `open-responses-streaming-for-player-turn` and AGENTS.md §3.2.6).
    //
    // Phase 5.B：flag 开启时优先 `submit_narrative`（4 字段 subset），否则
    // fallback 到 `submit_player_turn` envelope path。两条都走 provider-level
    // strict tool_choice（A only — server-side 投影降级不在这里做，冗余）。
    const usePlayerNarrativeTerminalTool = shouldUsePlayerNarrativeTerminalTool(body);
    const usePlayerTurnTerminalTool =
      !usePlayerNarrativeTerminalTool && shouldUsePlayerTurnTerminalTool(body);

    // Preserve the existing response-format contract even when the terminal tool
    // is enabled. The function parameter schema governs tool arguments; the
    // response_format remains a compatibility signal for established gateways,
    // tests, metrics, and immediate prefer-mode rollback.
    //
    // Phase 5.B：submit_narrative 4 字段 schema 已经覆盖 narrative 全部需要的内容，
    // 不再叠加 text.format.json_schema（避免双通道对同一字段给出不同值）。
    // json_object 是宽松约束，与 terminal tool 共存无冲突 → 保留。
    if (body.responseFormatJsonSchema && !usePlayerNarrativeTerminalTool) {
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
    if (usePlayerNarrativeTerminalTool) {
      payload.tools = [buildPlayerNarrativeTerminalTool()];
      payload.tool_choice = buildPlayerNarrativeTerminalToolChoice();
    } else if (usePlayerTurnTerminalTool) {
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
