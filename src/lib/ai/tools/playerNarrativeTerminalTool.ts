// src/lib/ai/tools/playerNarrativeTerminalTool.ts
import { envBoolean } from "@/lib/config/envRaw";
/**
 * Phase 5.B Symbolic World Model 路径下的 PLAYER_CHAT 真·可执行工具 terminal:
 *   `submit_narrative` —— 让 LLM 只能输出 narrative + options + 强制 decision_required，
 *   物理上禁止 state 字段（awarded_items / consumed_items / new_tasks / task_updates /
 *   player_location / hp_delta / sanity_damage / is_death / combat_state /
 *   relationship_updates / world_risks ...），强制走"真·可执行工具"路径。
 *
 * 与 `submit_player_turn` (envelope 路径) 的关键差异：
 *   - submit_player_turn 允许 LLM 自填 state 字段 → 容易 narrative 描述了 X 但 state 没变
 *   - submit_narrative schema 只有 4 字段 → LLM 只能输出 narrative + options，
 *     state 字段只能来自 write tools (grant_item / consume_materials / move_player / 等)
 *
 * 协议层不互斥（AGENTS.md §3.2.2/§3.2.5）：text.format.json_schema + submit_narrative
 * 工具可以同次下发，但本工具的 4 字段 schema 已经涵盖 narrative 全部需要的内容，
 * 所以默认不叠加 text.format。
 *
 * Flag 控制：VERSECRAFT_ENABLE_EXECUTABLE_TOOLS_PLAYER_CHAT（默认 false）。
 * Flag off 时继续走 submit_player_turn 路径（D5 fallback）。
 */
import type { NamedFunctionToolChoice, ToolDefinition } from "@/lib/ai/types/core";

export const PLAYER_NARRATIVE_TERMINAL_TOOL_NAME = "submit_narrative";

/**
 * submit_narrative 的严格 schema：
 * - 4 字段：narrative / options / turn_mode / decision_required
 * - turn_mode const 锁 "decision_required"（与 submit_player_turn 一致）
 * - decision_required const 锁 true
 * - options minItems 4 / maxItems 4（与 submit_player_turn 一致）
 * - additionalProperties: false（物理上禁止塞 state 字段）
 */
export const PLAYER_NARRATIVE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["narrative", "options", "turn_mode", "decision_required"],
  properties: {
    narrative: { type: "string", minLength: 1, description: "本回合的叙事正文" },
    options: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: { type: "string", minLength: 1, maxLength: 60 },
      description: "玩家下一步可用的 4 个候选行动",
    },
    turn_mode: { type: "string", const: "decision_required" },
    decision_required: { type: "boolean", const: true },
  },
};

/**
 * 构造传给 provider 的 `submit_narrative` 工具定义。
 */
export function buildPlayerNarrativeTerminalTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: PLAYER_NARRATIVE_TERMINAL_TOOL_NAME,
      description:
        "Submit exactly one complete VerseCraft player-turn narrative. " +
        "Put the final narrative + 4 candidate options in this function's arguments. " +
        "Do not emit prose outside the function call. " +
        "State changes must be expressed via write tools (grant_item / consume_materials / etc.), NOT in this envelope.",
      parameters: PLAYER_NARRATIVE_JSON_SCHEMA,
    },
  };
}

export function buildPlayerNarrativeTerminalToolChoice(): NamedFunctionToolChoice {
  return {
    type: "function",
    function: { name: PLAYER_NARRATIVE_TERMINAL_TOOL_NAME },
  };
}

export function isPlayerNarrativeTerminalToolName(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.trim() === PLAYER_NARRATIVE_TERMINAL_TOOL_NAME
  );
}

/**
 * Phase 5.B flag-gate：openaiResponsesGateway / openaiCompatibleGateway 共享。
 * flag 开 + 没人自带 tools → 注入 `submit_narrative` 终端工具。
 * 注意：stream 决策由 router/execute.ts 控制（看 params.stream + provider 能力），
 * gateway 只 translate stream 字段。不在这里判断 stream。
 */
export function shouldUsePlayerNarrativeTerminalTool(
  body: Pick<{ tools?: ReadonlyArray<unknown> }, "tools">
): boolean {
  if (body.tools && body.tools.length > 0) return false;
  return envBoolean("VERSECRAFT_ENABLE_EXECUTABLE_TOOLS_PLAYER_CHAT", false);
}
