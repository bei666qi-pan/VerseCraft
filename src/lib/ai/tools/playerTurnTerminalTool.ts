import { PLAYER_DM_JSON_SCHEMA } from "@/lib/ai/schemas/playerDmJsonSchema";
import type { NamedFunctionToolChoice, ToolDefinition } from "@/lib/ai/types/core";
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
