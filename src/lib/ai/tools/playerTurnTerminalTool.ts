import { PLAYER_DM_JSON_SCHEMA } from "@/lib/ai/schemas/playerDmJsonSchema";
import type { NamedFunctionToolChoice, NormalizedCompletionRequest, ToolDefinition } from "@/lib/ai/types/core";
import { envEnum } from "@/lib/config/envRaw";

/**
 * PLAYER_CHAT Function Calling rollout:
 * - off: keep response_format JSON behavior only.
 * - prefer: force the terminal tool, but retry once with json_object when the provider rejects tool parameters.
 * - required: force the terminal tool and surface provider incompatibility instead of silently downgrading.
 */
export type PlayerChatFunctionCallingMode = "off" | "prefer" | "required";

export const PLAYER_TURN_TERMINAL_TOOL_NAME = "submit_player_turn";

export function resolvePlayerChatFunctionCallingMode(): PlayerChatFunctionCallingMode {
  return envEnum(
    "AI_PLAYER_CHAT_FUNCTION_CALLING_MODE",
    ["off", "prefer", "required"] as const,
    "prefer"
  );
}

/**
 * Decide whether the gateway should auto-append the `submit_player_turn`
 * terminal tool. Shared by `openaiCompatibleGateway` and `openaiResponsesGateway`
 * so both transports gate strict-function mode on the same condition.
 *
 * Rules (mirror the original inline ternary in openaiCompatible.ts:56-58):
 *   1. Only streaming PLAYER_CHAT requests get the terminal tool — non-stream
 *      requests (e.g. Director reasoner) keep their caller-supplied tools.
 *   2. Mode must not be `off` (skip strict function entirely).
 *   3. The caller must not have supplied its own `body.tools` — caller tools
 *      always win (DM Agent tool loop / `tool_loop` chain paths).
 *
 * See AGENTS.md §3.2.6 and the change `open-responses-streaming-for-player-turn`.
 */
export function shouldUsePlayerTurnTerminalTool(
  body: Pick<NormalizedCompletionRequest, "stream" | "tools">,
): boolean {
  if (body.stream !== true) return false;
  if (resolvePlayerChatFunctionCallingMode() === "off") return false;
  if (body.tools && body.tools.length > 0) return false;
  return true;
}

/**
 * This is a terminal output envelope, not an executable gameplay tool. Its arguments
 * are treated as the model's final DM JSON and still pass through every existing
 * normalizer, validator, state machine, and commit guard.
 */
export function buildPlayerTurnTerminalTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: PLAYER_TURN_TERMINAL_TOOL_NAME,
      description:
        "Submit exactly one complete VerseCraft player turn. Put the final DM JSON in this function's arguments. Do not emit prose outside the function call and do not request another tool round.",
      parameters: PLAYER_DM_JSON_SCHEMA,
    },
  };
}

export function buildPlayerTurnTerminalToolChoice(): NamedFunctionToolChoice {
  return {
    type: "function",
    function: { name: PLAYER_TURN_TERMINAL_TOOL_NAME },
  };
}

export function isPlayerTurnTerminalToolName(value: unknown): boolean {
  return typeof value === "string" && value.trim() === PLAYER_TURN_TERMINAL_TOOL_NAME;
}
